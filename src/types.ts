import type { Client, AccountId, PrivateKey, TokenId } from "@hashgraph/sdk";

export interface UserAccount {
  evmAddress: string;
  hederaAccountId: string;
  privateKey: string;
}

export interface HederaContext {
  client: Client;
  operatorId: AccountId;
  operatorKey: PrivateKey;
  tokenId: TokenId;
}

export interface TxResult {
  transactionId: string;
  status: string;
}

/* ── API envelope ── */

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/* ── Token operations ── */

export interface MintRequest { amount: number }
export interface MintResponse { transactionId: string; newTotalSupply?: number }
export interface WipeRequest { accountId: string; amount: number }
export interface TransferRequest { from: string; to: string; amount: number }
export interface AssociateRequest { evmAddress: string }
export interface AssociateResponse { hederaAccountId: string; alreadyExisted: boolean }
export interface AllowanceRequest { evmAddress: string; amount: number }
export interface BalanceResponse { accountId: string; balance: number }

/* ── HCS (Hedera Consensus Service) ── */

export interface HcsSubmitRequest { topicId: string; message: Record<string, unknown> }
export interface HcsSubmitResponse { transactionId: string; sequenceNumber: string }
export interface HcsMessage { sequenceNumber: number; timestamp: string; content: unknown }

/* ── Song metadata ── */

export interface SongMetadata {
  title: string;
  artist: string;
  genre?: string;
  duration: number;
  buyoutPrice: number;
  previewRootHash: string;
  fullRootHash: string;
}

export interface SongRecord extends SongMetadata {
  songId: string;
  timestamp: string;
}

export interface SongUploadResponse { songId: string; transactionId: string }

/* ── ETH bridge ── */

export interface BuySonosRequest { txHash: string; ethAmount: string; evmAddress: string }
export interface BuySonosResponse { sonosMinted: number; transactionId: string }
export interface CashoutRequest { evmAddress: string; sonosAmount: number }
export interface CashoutResponse { ethSent: string; fee: string; txHash: string }
export interface VerifyEthRequest { txHash: string; expectedAmount: string; expectedFrom: string }
export interface VerifyEthResponse { verified: boolean; from: string; value: string; reason?: string }
export interface SendEthRequest { to: string; amount: string }
export interface SendEthResponse { txHash: string }

/* ── Managed accounts ── */

export interface ManagedAccount { evmAddress: string; hederaAccountId: string; privateKey: string }
