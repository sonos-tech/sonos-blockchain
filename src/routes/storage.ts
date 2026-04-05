/**
 * Storage route handlers.
 * Mounted at /internal/storage — 0G upload / download operations.
 */

import { Hono } from "hono";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { unlink, mkdir, readFile } from "node:fs/promises";

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

  const safeName = basename(file.name || "upload");
  const tempPath = join(tmpdir(), `sonos-upload-${Date.now()}-${safeName}`);
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

// POST /upload-memory — Upload a raw buffer to 0G (used for preview clips)
storageRoutes.post("/upload-memory", async (c) => {
  const tempPath = join(tmpdir(), `sonos-membuf-${Date.now()}`);
  try {
    const buffer = await c.req.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "request body required" }, 400);
    }

    await Bun.write(tempPath, buffer);
    const rootHash = await uploadFile(tempPath);
    return c.json<ApiResponse<{ rootHash: string }>>({
      ok: true,
      data: { rootHash },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /storage/upload-memory failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
});

// GET /download/:rootHash — Download a file from 0G and return it
storageRoutes.get("/download/:rootHash", async (c) => {
  const rootHash = c.req.param("rootHash");
  const tempPath = join(tmpdir(), `sonos-dl-${rootHash}-${Date.now()}`);

  try {
    await downloadFile(rootHash, tempPath);
    // Use Bun.file() — Bun optimizes this with sendfile()
    const file = Bun.file(tempPath);
    const size = file.size;
    const stream = file.stream();
    // Schedule cleanup after a delay to let streaming finish
    setTimeout(() => unlink(tempPath).catch(() => {}), 30_000);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(size),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /storage/download failed:", msg);
    await unlink(tempPath).catch(() => {});
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
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
