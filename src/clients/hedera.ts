/**
 * Hedera client setup.
 * Returns a HederaContext ready for all token operations.
 */
import { Client, AccountId, PrivateKey, TokenId } from "@hashgraph/sdk";
import { config } from "../config";
import type { HederaContext } from "../types";

export function createHederaContext(): HederaContext {
  const operatorId = AccountId.fromString(config.hedera.accountId);
  const operatorKey = PrivateKey.fromStringECDSA(config.hedera.privateKey);
  const tokenId = TokenId.fromString(config.token.id);

  const client =
    config.hedera.network === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();

  client.setOperator(operatorId, operatorKey);

  return { client, operatorId, operatorKey, tokenId };
}
