/**
 * Hedera service layer.
 *
 * Every token (HTS) and consensus (HCS) operation goes through this file.
 * Functions follow the pattern: build tx -> freezeWith(client) -> sign(key) -> execute(client) -> getReceipt(client).
 * Errors propagate to the caller (route layer catches).
 */

import {
  AccountCreateTransaction,
  AccountAllowanceApproveTransaction,
  AccountId,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TokenMintTransaction,
  TokenWipeTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

import type { TxResult } from "../types";
import { hedera } from "../context";

const { client, operatorId, operatorKey, tokenId } = hedera;

// ---------------------------------------------------------------------------
// HTS -- Token operations
// ---------------------------------------------------------------------------

/**
 * Mint new $SONOS tokens into the treasury account.
 * The operator key is used as the supply key (set at token creation).
 *
 * @param amount - Number of tokens to mint in the lowest denomination.
 * @returns Transaction ID and status from the receipt.
 */
export async function mintTokens(amount: number): Promise<TxResult> {
  const tx = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount)
    .freezeWith(client);

  const signed = await tx.sign(operatorKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

/**
 * Wipe (burn) tokens from a non-treasury account.
 * Decreases total supply. The operator key is the wipe key.
 *
 * @param accountId - The Hedera account to wipe tokens from.
 * @param amount    - Number of tokens to wipe in the lowest denomination.
 * @returns Transaction ID and status from the receipt.
 */
export async function wipeTokens(
  accountId: string,
  amount: number,
): Promise<TxResult> {
  const tx = new TokenWipeTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenId(tokenId)
    .setAmount(amount)
    .freezeWith(client);

  const signed = await tx.sign(operatorKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

/**
 * Transfer $SONOS tokens between two accounts.
 *
 * When the sender is the treasury (operatorId), the operator's client
 * auto-signs as fee payer, but we still explicitly sign with operatorKey.
 * When the sender is an external user account, provide `fromKey`.
 *
 * @param from    - Sender Hedera account ID.
 * @param to      - Receiver Hedera account ID.
 * @param amount  - Number of tokens in the lowest denomination.
 * @param fromKey - Private key of the sender. Omit for treasury sends.
 * @returns Transaction ID and status from the receipt.
 */
export async function transferTokens(
  from: string,
  to: string,
  amount: number,
  fromKey?: PrivateKey,
): Promise<TxResult> {
  const fromAccount = AccountId.fromString(from);
  const toAccount = AccountId.fromString(to);

  const tx = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccount, -amount)
    .addTokenTransfer(tokenId, toAccount, amount)
    .freezeWith(client);

  const key = fromKey ?? operatorKey;
  const signed = await tx.sign(key);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

/**
 * Transfer tokens using a pre-approved allowance (no sender signature needed).
 *
 * Used for stake escrow: the operator (approved spender) moves tokens from
 * the owner's account on their behalf.
 *
 * @param from   - Owner Hedera account ID (who granted the allowance).
 * @param to     - Receiver Hedera account ID.
 * @param amount - Number of tokens in the lowest denomination.
 * @returns Transaction ID and status from the receipt.
 */
export async function transferApproved(
  from: string,
  to: string,
  amount: number,
): Promise<TxResult> {
  const fromAccount = AccountId.fromString(from);
  const toAccount = AccountId.fromString(to);

  const tx = new TransferTransaction()
    .addApprovedTokenTransfer(tokenId, fromAccount, -amount)
    .addTokenTransfer(tokenId, toAccount, amount)
    .freezeWith(client);

  const signed = await tx.sign(operatorKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

/**
 * Associate a Hedera account with the $SONOS token.
 * Required before the account can receive any token transfers.
 *
 * @param accountId  - The account to associate.
 * @param accountKey - Private key of the account being associated (must sign).
 * @returns Transaction ID and status from the receipt.
 */
export async function associateToken(
  accountId: string,
  accountKey: PrivateKey,
): Promise<TxResult> {
  const tx = new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds([tokenId])
    .freezeWith(client);

  const signed = await tx.sign(accountKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

/**
 * Approve the operator as an allowance spender for the owner's tokens.
 *
 * The owner signs to grant the operator permission to spend up to `amount`
 * of their $SONOS tokens via `transferApproved`.
 *
 * @param ownerId  - The token owner's Hedera account ID.
 * @param ownerKey - The owner's private key (must sign the approval).
 * @param amount   - Maximum tokens the operator may spend.
 * @returns Transaction ID and status from the receipt.
 */
export async function approveAllowance(
  ownerId: string,
  ownerKey: PrivateKey,
  amount: number,
): Promise<TxResult> {
  const ownerAccount = AccountId.fromString(ownerId);

  const tx = new AccountAllowanceApproveTransaction()
    .approveTokenAllowance(tokenId, ownerAccount, operatorId, amount)
    .freezeWith(client);

  const signed = await tx.sign(ownerKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    status: receipt.status.toString(),
  };
}

// ---------------------------------------------------------------------------
// Account operations
// ---------------------------------------------------------------------------

/**
 * Create a new Hedera account with an ECDSA key pair.
 * The operator funds the new account with 1 HBAR for transaction fees.
 *
 * @returns The new account ID and raw private key (hex string).
 */
export async function createAccount(): Promise<{
  accountId: string;
  privateKey: string;
}> {
  const newKey = PrivateKey.generateECDSA();

  const tx = new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(1));

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    accountId: receipt.accountId!.toString(),
    privateKey: newKey.toStringRaw(),
  };
}

// ---------------------------------------------------------------------------
// HCS -- Consensus operations
// ---------------------------------------------------------------------------

/**
 * Submit a JSON message to an HCS topic.
 * The operator key is the submit key on all Sonos topics.
 *
 * @param topicId - The HCS topic ID (e.g. "0.0.12345").
 * @param message - Arbitrary JSON payload to publish.
 * @returns Transaction ID and the message sequence number.
 */
export async function submitHcsMessage(
  topicId: string,
  message: Record<string, unknown>,
): Promise<{ transactionId: string; sequenceNumber: string }> {
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(JSON.stringify(message))
    .freezeWith(client);

  const signed = await tx.sign(operatorKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    sequenceNumber: receipt.topicSequenceNumber!.toString(),
  };
}
