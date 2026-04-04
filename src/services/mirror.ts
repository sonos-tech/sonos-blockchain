/**
 * Mirror Node REST API wrapper.
 * Provides read-only access to Hedera network state via the public Mirror Node.
 * No SDK required -- plain fetch calls.
 */

import { config } from "../config";
import type { HcsMessage } from "../types";

const mirrorNode = config.mirrorNode;
const tokenId = config.token.id;

/**
 * Get the SONOS token balance for a specific account.
 * Returns the balance in internal (smallest) units, or 0 if the account
 * has no association / zero balance for the token.
 */
export async function getTokenBalance(accountId: string): Promise<number> {
  const url = `${mirrorNode}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Mirror Node error fetching token balance for ${accountId}: ${res.status} ${res.statusText}`,
    );
  }

  const data: any = await res.json();
  return data.tokens?.[0]?.balance ?? 0;
}

/**
 * Fetch HCS messages from a topic.
 * Each message payload is base64-decoded and JSON-parsed.
 * Malformed or empty messages are skipped with a warning log.
 */
export async function getHcsMessages(
  topicId: string,
  limit = 100,
  order: "asc" | "desc" = "asc",
): Promise<HcsMessage[]> {
  const url = `${mirrorNode}/api/v1/topics/${topicId}/messages?limit=${limit}&order=${order}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Mirror Node error fetching HCS messages for topic ${topicId}: ${res.status} ${res.statusText}`,
    );
  }

  const data: any = await res.json();
  const messages: HcsMessage[] = [];

  for (const msg of data.messages ?? []) {
    try {
      const decoded = Buffer.from(msg.message, "base64").toString("utf-8");
      const content: unknown = JSON.parse(decoded);
      messages.push({
        sequenceNumber: msg.sequence_number,
        timestamp: msg.consensus_timestamp,
        content,
      });
    } catch (err) {
      console.warn(
        `Skipping malformed HCS message seq=${msg.sequence_number} in topic ${topicId}:`,
        err,
      );
    }
  }

  return messages;
}

/**
 * Fetch account info from the Mirror Node.
 * Returns the parsed JSON object, or null if the account does not exist (404).
 */
export async function getAccountInfo(accountId: string): Promise<any | null> {
  const url = `${mirrorNode}/api/v1/accounts/${accountId}`;
  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(
      `Mirror Node error fetching account info for ${accountId}: ${res.status} ${res.statusText}`,
    );
  }

  return res.json();
}
