import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./routes/health";
import { tokenRoutes } from "./routes/token";
import { storageRoutes } from "./routes/storage";
import { hcsRoutes } from "./routes/hcs";
import { config } from "./config";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Routes
app.route("/internal", healthRoutes);
app.route("/internal/token", tokenRoutes);
app.route("/internal/storage", storageRoutes);
app.route("/internal/hcs", hcsRoutes);

// Placeholder mounts for later phases:
// app.route("/internal/song", songsRoutes);
// app.route("/internal/swap", swapRoutes);

console.log(`sonos-blockchain listening on port ${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
