/**
 * Managed account service.
 * Bridges EVM addresses (from Dynamic wallets) to Hedera accounts.
 *
 * - In-memory Map keyed by lowercase EVM address
 * - Persisted to data/accounts.json on every mutation
 * - Per-address Promise lock to prevent double-creation races
 */

import { PrivateKey } from "@hashgraph/sdk";
import { mkdir } from "node:fs/promises";

import { config } from "../config";
import { createAccount, associateToken, approveAllowance } from "./hedera";
import type { ManagedAccount } from "../types";

const DATA_DIR = "data";
const ACCOUNTS_FILE = `${DATA_DIR}/accounts.json`;

/** Primary store: lowercase EVM address -> ManagedAccount */
const accounts = new Map<string, ManagedAccount>();

/** In-flight creation locks to prevent double-creation races */
const locks = new Map<string, Promise<ManagedAccount>>();

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Load accounts from disk into the in-memory Map.
 * Called once at module initialisation. Safe to call if the file does not exist.
 */
function loadAccounts(): void {
  try {
    // Synchronous read at module init so the Map is populated before any
    // request handler runs. Bun.file().text() is async, so we use node:fs.
    const fs = require("node:fs");
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      console.log("[accounts] No persisted accounts file found, starting fresh.");
      return;
    }

    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
    const arr: ManagedAccount[] = JSON.parse(raw);

    for (const entry of arr) {
      accounts.set(entry.evmAddress.toLowerCase(), entry);
    }

    console.log(`[accounts] Loaded ${accounts.size} managed account(s) from disk.`);
  } catch (err) {
    console.warn("[accounts] Failed to load accounts file, starting with empty map:", err);
  }
}

/**
 * Persist current Map contents to disk as a JSON array.
 */
async function saveAccounts(): Promise<void> {
  const arr = Array.from(accounts.values());
  await Bun.write(ACCOUNTS_FILE, JSON.stringify(arr, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get or create a Hedera managed account for the given EVM address.
 *
 * If the account already exists in the Map it is returned immediately.
 * If another call is already creating this account (lock), we await the
 * same Promise to avoid double-creation.
 *
 * New accounts are:
 *   1. Created on Hedera (ECDSA key)
 *   2. Associated with the SONOS token
 *   3. Granted a default token allowance to the operator
 *   4. Persisted to disk
 */
export async function getOrCreateAccount(
  evmAddress: string,
): Promise<{ account: ManagedAccount; alreadyExisted: boolean }> {
  const key = evmAddress.toLowerCase();

  // Fast path: already exists
  const existing = accounts.get(key);
  if (existing) {
    return { account: existing, alreadyExisted: true };
  }

  // Check for in-flight creation
  const inflight = locks.get(key);
  if (inflight) {
    const account = await inflight;
    return { account, alreadyExisted: true };
  }

  // Start new creation
  const promise = (async (): Promise<ManagedAccount> => {
    const { accountId, privateKey } = await createAccount();

    const accountKey = PrivateKey.fromStringECDSA(privateKey);

    await associateToken(accountId, accountKey);
    await approveAllowance(accountId, accountKey, config.economy.defaultAllowance);

    const managed: ManagedAccount = {
      evmAddress: key,
      hederaAccountId: accountId,
      privateKey,
    };

    accounts.set(key, managed);
    await saveAccounts();

    return managed;
  })();

  locks.set(key, promise);

  try {
    const account = await promise;
    return { account, alreadyExisted: false };
  } finally {
    locks.delete(key);
  }
}

/**
 * Lookup a managed account by EVM address.
 * Returns undefined if not found.
 */
export function getAccount(evmAddress: string): ManagedAccount | undefined {
  return accounts.get(evmAddress.toLowerCase());
}

/**
 * Lookup a managed account by Hedera account ID (e.g. "0.0.12345").
 * Iterates the map values since the primary key is EVM address.
 * Returns undefined if not found.
 */
export function getAccountByHederaId(hederaAccountId: string): ManagedAccount | undefined {
  for (const acct of accounts.values()) {
    if (acct.hederaAccountId === hederaAccountId) {
      return acct;
    }
  }
  return undefined;
}

/**
 * Lookup a managed account by EVM address, throwing if not found.
 */
export function getAccountOrThrow(evmAddress: string): ManagedAccount {
  const account = getAccount(evmAddress);
  if (!account) {
    throw new Error(`Account not found for ${evmAddress}`);
  }
  return account;
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------

// Ensure data directory exists, then load persisted accounts.
await mkdir(DATA_DIR, { recursive: true });
loadAccounts();
