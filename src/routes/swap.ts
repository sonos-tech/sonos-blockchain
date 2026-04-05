/**
 * Swap route handlers.
 * Mounted at /internal/swap — ETH ↔ $SONOS bridge operations.
 */

import { Hono } from "hono";
import { parseEther, formatEther } from "viem";
import { sepolia } from "viem/chains";

import { mintTokens, transferTokens, transferApproved } from "../services/hedera";
import { getOrCreateAccount } from "../services/accounts";
import { config } from "../config";
import { hedera, eth } from "../context";

const { publicClient, walletClient, account: platformAccount } = eth;

import type {
  ApiResponse,
  BuySonosRequest,
  BuySonosResponse,
  CashoutRequest,
  CashoutResponse,
  VerifyEthRequest,
  VerifyEthResponse,
  SendEthRequest,
  SendEthResponse,
} from "../types";

export const swapRoutes = new Hono();

/**
 * POST /buy-sonos — Composite: verify ETH deposit → mint $SONOS → transfer to user.
 *
 * Flow:
 *   1. Verify the ETH tx on Sepolia (status, sender, recipient, value)
 *   2. Calculate SONOS amount from ETH
 *   3. Mint to treasury
 *   4. Transfer treasury → user
 */
swapRoutes.post("/buy-sonos", async (c) => {
  try {
    const { txHash, ethAmount, evmAddress } = await c.req.json<BuySonosRequest>();
    if (!txHash || !ethAmount || !evmAddress) {
      return c.json<ApiResponse<never>>({
        ok: false,
        error: "txHash, ethAmount, and evmAddress required",
      }, 400);
    }

    // 1. Verify ETH transaction (wait for it to be mined)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      return c.json<ApiResponse<never>>({ ok: false, error: "ETH transaction failed" }, 400);
    }

    const tx = await publicClient.getTransaction({
      hash: txHash as `0x${string}`,
    });

    // Check recipient is platform address
    if (tx.to?.toLowerCase() !== config.platform.ethAddress.toLowerCase()) {
      return c.json<ApiResponse<never>>({
        ok: false,
        error: "ETH not sent to platform address",
      }, 400);
    }

    // Check value meets expected amount
    const expectedWei = parseEther(ethAmount);
    if (tx.value < expectedWei) {
      return c.json<ApiResponse<never>>({
        ok: false,
        error: `ETH value ${formatEther(tx.value)} < expected ${ethAmount}`,
      }, 400);
    }

    // 2. Calculate SONOS amount
    const ethFloat = parseFloat(ethAmount);
    const sonosMinted = Math.floor(ethFloat * config.economy.ethToSonosRate);

    // 3. Ensure user has a Hedera account
    const { account } = await getOrCreateAccount(evmAddress);

    // 4. Mint to treasury
    await mintTokens(sonosMinted);

    // 5. Transfer treasury → user
    const result = await transferTokens(
      hedera.operatorId.toString(),
      account.hederaAccountId,
      sonosMinted,
    );

    return c.json<ApiResponse<BuySonosResponse>>({
      ok: true,
      data: { sonosMinted, transactionId: result.transactionId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /swap/buy-sonos failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

/**
 * POST /cashout — Composite: transfer $SONOS to treasury → send ETH back.
 *
 * Flow:
 *   1. Transfer user → treasury via allowance
 *   2. Calculate ETH (minus cashout fee)
 *   3. Send ETH to user's EVM address
 */
swapRoutes.post("/cashout", async (c) => {
  try {
    const { evmAddress, sonosAmount } = await c.req.json<CashoutRequest>();
    if (!evmAddress || !sonosAmount || sonosAmount <= 0) {
      return c.json<ApiResponse<never>>({
        ok: false,
        error: "evmAddress and positive sonosAmount required",
      }, 400);
    }

    // 1. Resolve user's Hedera account
    const { account } = await getOrCreateAccount(evmAddress);

    // 2. Transfer user → treasury via allowance
    await transferApproved(
      account.hederaAccountId,
      hedera.operatorId.toString(),
      sonosAmount,
    );

    // 3. Calculate ETH after fee
    const ethAmount = sonosAmount / config.economy.ethToSonosRate;
    const fee = ethAmount * (config.economy.cashoutFeePercent / 100);
    const ethAfterFee = ethAmount - fee;

    // 4. Send ETH
    const txHash = await walletClient.sendTransaction({
      account: platformAccount,
      chain: sepolia,
      to: evmAddress as `0x${string}`,
      value: parseEther(ethAfterFee.toFixed(18)),
    });

    return c.json<ApiResponse<CashoutResponse>>({
      ok: true,
      data: {
        ethSent: ethAfterFee.toFixed(18),
        fee: fee.toFixed(18),
        txHash,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /swap/cashout failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

/**
 * POST /verify-eth — Building block: verify an ETH transaction.
 */
swapRoutes.post("/verify-eth", async (c) => {
  try {
    const { txHash, expectedAmount, expectedFrom } = await c.req.json<VerifyEthRequest>();
    if (!txHash) {
      return c.json<ApiResponse<never>>({ ok: false, error: "txHash required" }, 400);
    }

    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    const tx = await publicClient.getTransaction({
      hash: txHash as `0x${string}`,
    });

    const verified =
      receipt.status === "success" &&
      (!expectedFrom || tx.from.toLowerCase() === expectedFrom.toLowerCase()) &&
      (!expectedAmount || tx.value >= parseEther(expectedAmount));

    const reason = !verified
      ? receipt.status !== "success"
        ? "Transaction failed"
        : expectedFrom && tx.from.toLowerCase() !== expectedFrom.toLowerCase()
          ? "Sender mismatch"
          : "Value too low"
      : undefined;

    return c.json<ApiResponse<VerifyEthResponse>>({
      ok: true,
      data: {
        verified,
        from: tx.from,
        value: formatEther(tx.value),
        reason,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /swap/verify-eth failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});

/**
 * POST /send-eth — Building block: send ETH from platform wallet.
 */
swapRoutes.post("/send-eth", async (c) => {
  try {
    const { to, amount } = await c.req.json<SendEthRequest>();
    if (!to || !amount) {
      return c.json<ApiResponse<never>>({ ok: false, error: "to and amount required" }, 400);
    }

    const txHash = await walletClient.sendTransaction({
      account: platformAccount,
      chain: sepolia,
      to: to as `0x${string}`,
      value: parseEther(amount),
    });

    return c.json<ApiResponse<SendEthResponse>>({
      ok: true,
      data: { txHash },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /swap/send-eth failed:", msg);
    return c.json<ApiResponse<never>>({ ok: false, error: msg }, 500);
  }
});
