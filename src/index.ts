import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./routes/health";
import { tokenRoutes } from "./routes/token";
import { storageRoutes } from "./routes/storage";
import { hcsRoutes } from "./routes/hcs";
import { songRoutes } from "./routes/songs";
import { swapRoutes } from "./routes/swap";
import { config } from "./config";
import { getTokenBalance } from "./services/mirror";
import type { ApiResponse, BalanceResponse } from "./types";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Routes
app.route("/internal", healthRoutes);
app.route("/internal/token", tokenRoutes);
app.route("/internal/storage", storageRoutes);
app.route("/internal/hcs", hcsRoutes);
app.route("/internal/song", songRoutes);
app.route("/internal", songRoutes); // Also mount at /internal for /songs and /previews
app.route("/internal/swap", swapRoutes);

// Top-level balance route (spec: GET /internal/balance/:accountId)
app.get("/internal/balance/:accountId", async (c) => {
  try {
    const accountId = c.req.param("accountId");
    const balance = await getTokenBalance(accountId);
    return c.json<ApiResponse<BalanceResponse>>({
      ok: true,
      data: { accountId, balance },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

console.log(`sonos-blockchain listening on port ${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 255, // seconds — 0G downloads can take minutes
};
