/**
 * Token route handlers.
 * Mounted at /internal/token — all $SONOS token operations.
 */

import { Hono } from "hono";
import { PrivateKey } from "@hashgraph/sdk";

import {
  mintTokens,
  wipeTokens,
  transferTokens,
  transferApproved,
  approveAllowance,
} from "../services/hedera";
import { getTokenBalance } from "../services/mirror";
import { getOrCreateAccount, getAccountByHederaId } from "../services/accounts";
import { hedera } from "../context";

import type {
  ApiResponse,
  MintRequest,
  MintResponse,
  WipeRequest,
  TransferRequest,
  AssociateRequest,
  AssociateResponse,
  AllowanceRequest,
  BalanceResponse,
  TxResult,
} from "../types";

export const tokenRoutes = new Hono();

// POST /mint — Mint $SONOS to treasury
tokenRoutes.post("/mint", async (c) => {
  try {
    const { amount } = await c.req.json<MintRequest>();
    if (!amount || amount <= 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "amount must be positive" }, 400);
    }
    const result = await mintTokens(amount);
    return c.json<ApiResponse<MintResponse>>({
      ok: true,
      data: { transactionId: result.transactionId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/mint failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// POST /wipe — Burn $SONOS from a non-treasury account
tokenRoutes.post("/wipe", async (c) => {
  try {
    const { accountId, amount } = await c.req.json<WipeRequest>();
    if (!accountId || !amount || amount <= 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "accountId and positive amount required" }, 400);
    }
    const result = await wipeTokens(accountId, amount);
    return c.json<ApiResponse<TxResult>>({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/wipe failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// POST /transfer — Direct transfer between accounts
tokenRoutes.post("/transfer", async (c) => {
  try {
    const { from, to, amount } = await c.req.json<TransferRequest>();
    if (!from || !to || !amount || amount <= 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "from, to, and positive amount required" }, 400);
    }
    // If sender is not treasury, look up their managed account key
    let fromKey: PrivateKey | undefined;
    if (from !== hedera.operatorId.toString()) {
      const managed = getAccountByHederaId(from);
      if (!managed) {
        return c.json<ApiResponse<never>>({ ok: false, error: `No managed account found for ${from}` }, 404);
      }
      fromKey = PrivateKey.fromStringECDSA(managed.privateKey);
    }
    const result = await transferTokens(from, to, amount, fromKey);
    return c.json<ApiResponse<TxResult>>({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/transfer failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// POST /transfer-approved — Transfer via allowance (stake escrow)
tokenRoutes.post("/transfer-approved", async (c) => {
  try {
    const { from, to, amount } = await c.req.json<TransferRequest>();
    if (!from || !to || !amount || amount <= 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "from, to, and positive amount required" }, 400);
    }
    const result = await transferApproved(from, to, amount);
    return c.json<ApiResponse<TxResult>>({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/transfer-approved failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// POST /associate — Onboard user: create Hedera account + associate + allowance
tokenRoutes.post("/associate", async (c) => {
  try {
    const { evmAddress } = await c.req.json<AssociateRequest>();
    if (!evmAddress) {
      return c.json<ApiResponse<never>>({ ok: false, error: "evmAddress required" }, 400);
    }
    const { account, alreadyExisted } = await getOrCreateAccount(evmAddress);
    return c.json<ApiResponse<AssociateResponse>>({
      ok: true,
      data: { hederaAccountId: account.hederaAccountId, alreadyExisted },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/associate failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// POST /allowance — Top-up operator allowance for a user
tokenRoutes.post("/allowance", async (c) => {
  try {
    const { evmAddress, amount } = await c.req.json<AllowanceRequest>();
    if (!evmAddress || !amount || amount <= 0) {
      return c.json<ApiResponse<never>>({ ok: false, error: "evmAddress and positive amount required" }, 400);
    }
    const { account } = await getOrCreateAccount(evmAddress);
    const ownerKey = PrivateKey.fromStringECDSA(account.privateKey);
    const result = await approveAllowance(account.hederaAccountId, ownerKey, amount);
    return c.json<ApiResponse<TxResult>>({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /token/allowance failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

// GET /balance/:accountId — Token balance via Mirror Node
tokenRoutes.get("/balance/:accountId", async (c) => {
  try {
    const accountId = c.req.param("accountId");
    const balance = await getTokenBalance(accountId);
    return c.json<ApiResponse<BalanceResponse>>({
      ok: true,
      data: { accountId, balance },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /token/balance failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});
