/**
 * HCS (Hedera Consensus Service) route handlers.
 * Mounted at /internal/hcs — submit and read topic messages.
 */

import { Hono } from "hono";

import { submitHcsMessage } from "../services/hedera";
import { getHcsMessages } from "../services/mirror";

import type {
  ApiResponse,
  HcsSubmitRequest,
  HcsSubmitResponse,
  HcsMessage,
} from "../types";

export const hcsRoutes = new Hono();

// POST /submit — Publish a JSON message to an HCS topic
hcsRoutes.post("/submit", async (c) => {
  try {
    const { topicId, message } = await c.req.json<HcsSubmitRequest>();
    if (!topicId || !message) {
      return c.json<ApiResponse<never>>({ ok: false, error: "topicId and message required" }, 400);
    }
    const result = await submitHcsMessage(topicId, message);
    return c.json<ApiResponse<HcsSubmitResponse>>({
      ok: true,
      data: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /hcs/submit failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// GET /messages/:topicId — Read messages from an HCS topic
hcsRoutes.get("/messages/:topicId", async (c) => {
  try {
    const topicId = c.req.param("topicId");
    const limit = parseInt(c.req.query("limit") || "100", 10);
    const order = (c.req.query("order") || "asc") as "asc" | "desc";

    const messages = await getHcsMessages(topicId, limit, order);
    return c.json<ApiResponse<HcsMessage[]>>({
      ok: true,
      data: messages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /hcs/messages failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});
