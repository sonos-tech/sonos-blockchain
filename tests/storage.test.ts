/**
 * 0G storage tests — CONSUMES 0G CREDITS.
 *
 * Tests file upload, download, prefetch, and the composite song upload flow.
 * Uses res/test_songs/2.mp3 (1.3MB) to minimize credit usage.
 *
 * Run: bun test tests/storage.test.ts
 * Requires: server running on localhost:3001
 */

import { describe, test, expect, beforeAll } from "bun:test";
import path from "node:path";
import { stat } from "node:fs/promises";

const BASE = "http://localhost:3001/internal";

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: (await res.json()) as any };
}

const SONG_FILE = path.resolve(import.meta.dir, "../res/test_songs/2.mp3");
let songFileSize: number;
let rootHash: string;

// State for composite song upload test
const artistEvmAddress = `0xArtist_${Date.now()}`;
let artistHederaId: string;

beforeAll(async () => {
  const s = await stat(SONG_FILE);
  songFileSize = s.size;
});

// ---------------------------------------------------------------------------
// Raw storage operations (1 upload = 1 0G credit use)
// ---------------------------------------------------------------------------

describe("0G storage", () => {
  test("upload file returns root hash", async () => {
    const form = new FormData();
    form.append("file", Bun.file(SONG_FILE));

    const res = await fetch(`${BASE}/storage/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json() as any;

    expect(data.ok).toBe(true);
    expect(data.data.rootHash).toMatch(/^0x[a-f0-9]{64}$/);
    rootHash = data.data.rootHash;
  }, 180_000);

  test("upload rejects missing file", async () => {
    const res = await fetch(`${BASE}/storage/upload`, {
      method: "POST",
      body: new FormData(),
    });
    const data = await res.json() as any;
    expect(data.ok).toBe(false);
    expect(data.error).toContain("file");
  });

  test("download returns correct file size", async () => {
    const res = await fetch(`${BASE}/storage/download/${rootHash}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(songFileSize);
  }, 120_000);

  test("prefetch downloads to cache (first call)", async () => {
    // Use a different mechanism: the previous download used a temp path that was
    // cleaned up, so prefetch should download fresh into the cache dir.
    const res = await fetch(`${BASE}/storage/prefetch/${rootHash}`, {
      method: "POST",
    });
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    // May be true or false depending on cache state
    expect(typeof data.data.cached).toBe("boolean");
  }, 120_000);

  test("prefetch returns cached on second call", async () => {
    const res = await fetch(`${BASE}/storage/prefetch/${rootHash}`, {
      method: "POST",
    });
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.data.cached).toBe(true);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Composite song upload (2 x 0G uploads: full + preview)
// ---------------------------------------------------------------------------

describe("composite song upload", () => {
  beforeAll(async () => {
    // Onboard an artist account
    const assoc = await post("/token/associate", { evmAddress: artistEvmAddress });
    expect(assoc.ok).toBe(true);
    artistHederaId = assoc.data.hederaAccountId;

    // Mint tokens and transfer enough for upload cost (1000 = 10 SONOS)
    await post("/token/mint", { amount: 5000 });
    await post("/token/transfer", {
      from: "0.0.8507361",
      to: artistHederaId,
      amount: 5000,
    });

    // Wait for Mirror Node to reflect balance
    await new Promise((r) => setTimeout(r, 6000));
  }, 90_000);

  test("song upload rejects insufficient balance", async () => {
    const poorEvmAddress = `0xPoor_${Date.now()}`;
    const assoc = await post("/token/associate", { evmAddress: poorEvmAddress });
    expect(assoc.ok).toBe(true);

    // Don't fund this account — balance is 0
    // Wait for mirror node
    await new Promise((r) => setTimeout(r, 6000));

    const form = new FormData();
    form.append("file", Bun.file(SONG_FILE));
    form.append("title", "Broke Song");
    form.append("artist", poorEvmAddress);
    form.append("genre", "Electronic");
    form.append("duration", "31");
    form.append("buyoutPrice", "5000");

    const res = await fetch(`${BASE}/song/upload`, { method: "POST", body: form });
    const data = await res.json() as any;
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Insufficient balance");
  }, 90_000);

  test("song upload rejects low buyout price", async () => {
    const form = new FormData();
    form.append("file", Bun.file(SONG_FILE));
    form.append("title", "Cheap Song");
    form.append("artist", artistEvmAddress);
    form.append("genre", "Electronic");
    form.append("duration", "31");
    form.append("buyoutPrice", "100"); // below min 5000

    const res = await fetch(`${BASE}/song/upload`, { method: "POST", body: form });
    const data = await res.json() as any;
    expect(data.ok).toBe(false);
    expect(data.error).toContain("buyoutPrice");
  });

  test("full song upload: 0G x2 + wipe + HCS", async () => {
    const form = new FormData();
    form.append("file", Bun.file(SONG_FILE));
    form.append("title", "Test Suite Song");
    form.append("artist", artistEvmAddress);
    form.append("genre", "Electronic");
    form.append("duration", "31");
    form.append("buyoutPrice", "5000");

    const res = await fetch(`${BASE}/song/upload`, { method: "POST", body: form });
    const data = await res.json() as any;

    expect(data.ok).toBe(true);
    expect(data.data.songId).toBeTruthy();
    expect(data.data.transactionId).toBeTruthy();
  }, 300_000); // 5min — two 0G uploads can be slow

  test("song appears in listing after upload", async () => {
    // Wait for Mirror Node
    await new Promise((r) => setTimeout(r, 8000));

    const { data } = await get("/song/songs?limit=10");
    expect(data.ok).toBe(true);
    const song = data.data.find((s: any) => s.title === "Test Suite Song");
    expect(song).toBeTruthy();
    expect(song.artist).toBe(artistEvmAddress);
    expect(song.previewRootHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(song.fullRootHash).toMatch(/^0x[a-f0-9]{64}$/);
  }, 15_000);

  test("artist balance decreased by upload cost", async () => {
    await new Promise((r) => setTimeout(r, 6000));
    const { data } = await get(`/token/balance/${artistHederaId}`);
    expect(data.ok).toBe(true);
    // Started with 5000, upload cost is 1000, but 2% auto-fee on transfer
    // so received ~4900, then 1000 wiped = ~3900
    expect(data.data.balance).toBeLessThan(5000);
    expect(data.data.balance).toBeGreaterThan(0);
  }, 15_000);
});
