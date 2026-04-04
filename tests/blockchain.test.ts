/**
 * Core blockchain tests — NO 0G credits consumed.
 *
 * Tests Hedera HTS (mint, transfer, wipe, allowance, associate),
 * HCS (submit, read), Mirror Node (balance), and validation paths.
 *
 * Run: bun test tests/blockchain.test.ts
 * Requires: server running on localhost:3001
 */

import { describe, test, expect, beforeAll } from "bun:test";

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
  return res.json() as Promise<any>;
}

// State shared across tests (sequential order matters)
let userHederaId: string;
const testEvmAddress = `0xTestSuite_${Date.now()}`;

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

describe("preflight", () => {
  test("server is reachable", async () => {
    const data = await get("/health");
    expect(data.status).toBe("ok");
    expect(data.service).toBe("sonos-blockchain");
  });
});

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

describe("token", () => {
  // -- Validation --

  test("mint rejects zero amount", async () => {
    const data = await post("/token/mint", { amount: 0 });
    expect(data.ok).toBe(false);
  });

  test("mint rejects negative amount", async () => {
    const data = await post("/token/mint", { amount: -10 });
    expect(data.ok).toBe(false);
  });

  test("transfer rejects missing fields", async () => {
    const data = await post("/token/transfer", { from: "0.0.1", amount: 100 });
    expect(data.ok).toBe(false);
  });

  test("wipe rejects missing accountId", async () => {
    const data = await post("/token/wipe", { amount: 100 });
    expect(data.ok).toBe(false);
  });

  test("associate rejects missing evmAddress", async () => {
    const data = await post("/token/associate", {});
    expect(data.ok).toBe(false);
  });

  test("allowance rejects missing fields", async () => {
    const data = await post("/token/allowance", { evmAddress: "0x1" });
    expect(data.ok).toBe(false);
  });

  test("transfer rejects unknown sender", async () => {
    const data = await post("/token/transfer", {
      from: "0.0.9999999",
      to: "0.0.8507361",
      amount: 1,
    });
    expect(data.ok).toBe(false);
    expect(data.error).toContain("No managed account");
  });

  // -- Mint --

  test("mint tokens to treasury", async () => {
    const data = await post("/token/mint", { amount: 50000 });
    expect(data.ok).toBe(true);
    expect(data.data.transactionId).toBeTruthy();
  }, 30_000);

  // -- Onboard user --

  test("associate creates new account", async () => {
    const data = await post("/token/associate", { evmAddress: testEvmAddress });
    expect(data.ok).toBe(true);
    expect(data.data.alreadyExisted).toBe(false);
    expect(data.data.hederaAccountId).toMatch(/^0\.0\.\d+$/);
    userHederaId = data.data.hederaAccountId;
  }, 60_000);

  test("associate is idempotent", async () => {
    const data = await post("/token/associate", { evmAddress: testEvmAddress });
    expect(data.ok).toBe(true);
    expect(data.data.alreadyExisted).toBe(true);
    expect(data.data.hederaAccountId).toBe(userHederaId);
  }, 15_000);

  // -- Transfer treasury → user --

  test("transfer from treasury to user", async () => {
    const data = await post("/token/transfer", {
      from: "0.0.8507361",
      to: userHederaId,
      amount: 10000,
    });
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("SUCCESS");
  }, 30_000);

  // -- Balance (Mirror Node has ~5s delay) --

  test("balance reflects transfer", async () => {
    // Wait for Mirror Node to catch up
    await new Promise((r) => setTimeout(r, 6000));
    const data = await get(`/token/balance/${userHederaId}`);
    expect(data.ok).toBe(true);
    expect(data.data.balance).toBeGreaterThanOrEqual(10000);
  }, 15_000);

  // -- Transfer via allowance (stake escrow) --

  test("transfer-approved moves tokens via allowance", async () => {
    const data = await post("/token/transfer-approved", {
      from: userHederaId,
      to: "0.0.8507361",
      amount: 100,
    });
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("SUCCESS");
  }, 30_000);

  // -- Wipe --

  test("wipe burns tokens from user", async () => {
    const data = await post("/token/wipe", {
      accountId: userHederaId,
      amount: 100,
    });
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("SUCCESS");
  }, 30_000);

  // -- Allowance top-up --

  test("allowance top-up succeeds", async () => {
    const data = await post("/token/allowance", {
      evmAddress: testEvmAddress,
      amount: 50000,
    });
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("SUCCESS");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// HCS
// ---------------------------------------------------------------------------

describe("hcs", () => {
  let sequenceNumber: string;

  test("submit rejects missing fields", async () => {
    const data = await post("/hcs/submit", { topicId: "0.0.8509451" });
    expect(data.ok).toBe(false);
  });

  test("submit message to song topic", async () => {
    const data = await post("/hcs/submit", {
      topicId: "0.0.8509451",
      message: { type: "test-suite", ts: Date.now() },
    });
    expect(data.ok).toBe(true);
    expect(data.data.sequenceNumber).toBeTruthy();
    sequenceNumber = data.data.sequenceNumber;
  }, 30_000);

  test("submit message to play-log topic", async () => {
    const data = await post("/hcs/submit", {
      topicId: "0.0.8509453",
      message: { type: "test-play", listener: testEvmAddress },
    });
    expect(data.ok).toBe(true);
  }, 30_000);

  test("read messages from song topic", async () => {
    // Wait for Mirror Node
    await new Promise((r) => setTimeout(r, 6000));
    const data = await get("/hcs/messages/0.0.8509451?limit=10&order=desc");
    expect(data.ok).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0].content).toBeTruthy();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Swap (validation only — no real Sepolia txs)
// ---------------------------------------------------------------------------

describe("swap validation", () => {
  test("buy-sonos rejects missing fields", async () => {
    const data = await post("/swap/buy-sonos", { ethAmount: "0.01" });
    expect(data.ok).toBe(false);
  });

  test("cashout rejects zero amount", async () => {
    const data = await post("/swap/cashout", {
      evmAddress: testEvmAddress,
      sonosAmount: 0,
    });
    expect(data.ok).toBe(false);
  });

  test("verify-eth rejects missing txHash", async () => {
    const data = await post("/swap/verify-eth", {
      expectedAmount: "0.01",
      expectedFrom: "0x1",
    });
    expect(data.ok).toBe(false);
  });

  test("send-eth rejects missing fields", async () => {
    const data = await post("/swap/send-eth", { to: "0x1" });
    expect(data.ok).toBe(false);
  });

  test("verify-eth handles non-existent tx gracefully", async () => {
    const data = await post("/swap/verify-eth", {
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      expectedAmount: "0.01",
      expectedFrom: "0x1",
    });
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Transaction");
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Songs listing (no upload — that needs 0G)
// ---------------------------------------------------------------------------

describe("songs", () => {
  test("songs list returns array", async () => {
    const data = await get("/song/songs");
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
