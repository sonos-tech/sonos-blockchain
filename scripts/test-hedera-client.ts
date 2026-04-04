/**
 * Test: Verify Hedera client connects and can query operator balance.
 *
 * Usage: bun run test:hedera-client
 */
import { AccountBalanceQuery } from "@hashgraph/sdk";
import { createHederaContext } from "../src/clients/hedera";

const ctx = createHederaContext();

console.log("=== Hedera Client Test ===");
console.log(`Operator: ${ctx.operatorId.toString()}`);
console.log(`Token:    ${ctx.tokenId.toString()}`);
console.log();

console.log("Querying operator balance...");
const balance = await new AccountBalanceQuery()
  .setAccountId(ctx.operatorId)
  .execute(ctx.client);

console.log(`HBAR:  ${balance.hbars.toString()}`);

const tokenBalance = balance.tokens?.get(ctx.tokenId);
console.log(`SONOS: ${tokenBalance?.toString() ?? "0"}`);
console.log();
console.log("=== Client OK ===");
