/**
 * Song route handlers.
 * Mounted at /internal/song — composite upload + listing.
 */

import { Hono } from "hono";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

import { uploadFile } from "../services/storage";
import { wipeTokens, submitHcsMessage } from "../services/hedera";
import { getTokenBalance } from "../services/mirror";
import { getHcsMessages } from "../services/mirror";
import { getAccountOrThrow } from "../services/accounts";
import { config } from "../config";

import type {
  ApiResponse,
  SongUploadResponse,
  SongRecord,
  SongMetadata,
} from "../types";

export const songRoutes = new Hono();

/**
 * POST /upload — Full song upload orchestration:
 *   1. Resolve artist EVM → Hedera account
 *   2. Check balance >= uploadCost
 *   3. Upload full MP3 to 0G
 *   4. Generate 30s preview (ffmpeg) and upload to 0G
 *   5. Wipe uploadCost tokens from artist
 *   6. Submit song metadata to HCS song topic
 */
songRoutes.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  const title = body["title"] as string;
  const artist = body["artist"] as string; // EVM address
  const genre = (body["genre"] as string) || undefined;
  const duration = parseInt(body["duration"] as string, 10);
  const buyoutPrice = parseInt(body["buyoutPrice"] as string, 10);

  if (!file || !(file instanceof File) || !title || !artist || !duration || !buyoutPrice) {
    return c.json<ApiResponse<never>>({
      ok: false,
      error: "Required: file, title, artist (EVM), duration, buyoutPrice",
    }, 400);
  }

  if (buyoutPrice < config.economy.minBuyoutPrice) {
    return c.json<ApiResponse<never>>({
      ok: false,
      error: `buyoutPrice must be >= ${config.economy.minBuyoutPrice}`,
    }, 400);
  }

  const fullPath = join(tmpdir(), `sonos-song-${Date.now()}-${file.name}`);
  const previewPath = join(tmpdir(), `sonos-preview-${Date.now()}-${file.name}`);

  try {
    // 1. Resolve artist
    const account = getAccountOrThrow(artist);

    // 2. Check balance
    const balance = await getTokenBalance(account.hederaAccountId);
    if (balance < config.economy.uploadCost) {
      return c.json<ApiResponse<never>>({
        ok: false,
        error: `Insufficient balance: ${balance} < ${config.economy.uploadCost} required`,
      }, 400);
    }

    // 3. Write MP3 to temp
    const buffer = await file.arrayBuffer();
    await Bun.write(fullPath, buffer);

    // 4. Generate 30s preview via ffmpeg (fallback: copy full file)
    try {
      const proc = Bun.spawn(
        ["ffmpeg", "-i", fullPath, "-t", "30", "-ab", "96k", "-y", previewPath],
        { stdout: "ignore", stderr: "ignore" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) throw new Error("ffmpeg non-zero exit");
    } catch {
      // ffmpeg not available — use full file as preview (hackathon fallback)
      await Bun.write(previewPath, buffer);
    }

    // 5. Upload both to 0G
    const [fullRootHash, previewRootHash] = await Promise.all([
      uploadFile(fullPath),
      uploadFile(previewPath),
    ]);

    // 6. Wipe upload cost from artist
    await wipeTokens(account.hederaAccountId, config.economy.uploadCost);

    // 7. Submit to HCS song topic
    const metadata: SongMetadata = {
      title,
      artist,
      genre,
      duration,
      buyoutPrice,
      previewRootHash,
      fullRootHash,
    };

    const hcsResult = await submitHcsMessage(config.topics.songTopicId, metadata as unknown as Record<string, unknown>);

    return c.json<ApiResponse<SongUploadResponse>>({
      ok: true,
      data: {
        songId: hcsResult.sequenceNumber,
        transactionId: hcsResult.transactionId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /song/upload failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  } finally {
    await unlink(fullPath).catch(() => {});
    await unlink(previewPath).catch(() => {});
  }
});

/**
 * GET /songs — List all songs from the HCS song topic.
 * Reads Mirror Node, parses each message as SongMetadata.
 */
songRoutes.get("/songs", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "100", 10);
    const messages = await getHcsMessages(config.topics.songTopicId, limit, "desc");

    const songs: SongRecord[] = [];
    for (const msg of messages) {
      try {
        const meta = msg.content as SongMetadata;
        if (meta.title && meta.fullRootHash) {
          songs.push({
            ...meta,
            songId: String(msg.sequenceNumber),
            timestamp: msg.timestamp,
          });
        }
      } catch {
        // Skip malformed entries
      }
    }

    return c.json<ApiResponse<SongRecord[]>>({ ok: true, data: songs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /songs failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});
