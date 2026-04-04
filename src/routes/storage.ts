/**
 * Storage route handlers.
 * Mounted at /internal/storage — 0G upload / download operations.
 */

import { Hono } from "hono";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, mkdir } from "node:fs/promises";

import { uploadFile, downloadFile } from "../services/storage";
import type { ApiResponse } from "../types";

export const storageRoutes = new Hono();

const CACHE_DIR = join(tmpdir(), "sonos-cache");

// Ensure cache dir exists on module load
await mkdir(CACHE_DIR, { recursive: true });

// POST /upload — Upload a file via multipart form data
storageRoutes.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json<ApiResponse<never>>({ ok: false, error: "file field required (multipart)" }, 400);
  }

  const tempPath = join(tmpdir(), `sonos-upload-${Date.now()}-${file.name}`);
  try {
    // Write uploaded data to a temp file (0G SDK needs a file path)
    const buffer = await file.arrayBuffer();
    await Bun.write(tempPath, buffer);

    const rootHash = await uploadFile(tempPath);
    return c.json<ApiResponse<{ rootHash: string }>>({
      ok: true,
      data: { rootHash },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /storage/upload failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
});

// GET /download/:rootHash — Download a file from 0G and stream it back
storageRoutes.get("/download/:rootHash", async (c) => {
  const rootHash = c.req.param("rootHash");
  const tempPath = join(tmpdir(), `sonos-dl-${rootHash}`);

  try {
    await downloadFile(rootHash, tempPath);
    const data = await Bun.file(tempPath).arrayBuffer();
    return new Response(data, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /storage/download failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
});

// POST /prefetch/:rootHash — Download to cache dir for later fast serving
storageRoutes.post("/prefetch/:rootHash", async (c) => {
  const rootHash = c.req.param("rootHash");
  const cachePath = join(CACHE_DIR, rootHash);

  try {
    // Skip if already cached
    if (await Bun.file(cachePath).exists()) {
      return c.json<ApiResponse<{ cached: boolean }>>({
        ok: true,
        data: { cached: true },
      });
    }

    await downloadFile(rootHash, cachePath);
    return c.json<ApiResponse<{ cached: boolean }>>({
      ok: true,
      data: { cached: false },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /storage/prefetch failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});
