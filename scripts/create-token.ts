/**
 * Creates the $SONOS HTS token on Hedera testnet.
 *
 * Requires env: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_NETWORK
 * Outputs: SONOS_TOKEN_ID
 */
import {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  CustomFractionalFee,
} from "@hashgraph/sdk";

const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKey = process.env.HEDERA_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || "testnet";

if (!accountId || !privateKey) {
  console.error("Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY");
  process.exit(1);
}

const operatorId = AccountId.fromString(accountId);
const operatorKey = PrivateKey.fromStringECDSA(privateKey);

const client =
  network === "mainnet"
    ? Client.forMainnet().setOperator(operatorId, operatorKey)
    : Client.forTestnet().setOperator(operatorId, operatorKey);

// Keys for token management — all set to operator for hackathon simplicity
const supplyKey = operatorKey;
const wipeKey = operatorKey;
const adminKey = operatorKey;
const feeScheduleKey = operatorKey;

// 2% fractional fee, sender pays, collected by operator (treasury)
const platformFee = new CustomFractionalFee()
  .setNumerator(2)
  .setDenominator(100)
  .setMin(1) // minimum 1 unit (0.01 SONOS)
  .setAssessmentMethod(true) // sender pays
  .setFeeCollectorAccountId(operatorId);

console.log("Creating $SONOS token...");
console.log(`  Operator: ${accountId}`);
console.log(`  Network:  ${network}`);
console.log();

const tx = new TokenCreateTransaction()
  .setTokenName("Sonos")
  .setTokenSymbol("SONOS")
  .setTokenType(TokenType.FungibleCommon)
  .setDecimals(2)
  .setInitialSupply(1_000_000) // 10,000.00 SONOS
  .setTreasuryAccountId(operatorId)
  .setSupplyType(TokenSupplyType.Infinite)
  .setSupplyKey(supplyKey.publicKey)
  .setWipeKey(wipeKey.publicKey)
  .setAdminKey(adminKey.publicKey)
  .setFeeScheduleKey(feeScheduleKey.publicKey)
  .setCustomFees([platformFee])
  .freezeWith(client);

const signedTx = await tx.sign(operatorKey);
const response = await signedTx.execute(client);
const receipt = await response.getReceipt(client);

const tokenId = receipt.tokenId!;

console.log("=== $SONOS Token Created ===");
console.log(`SONOS_TOKEN_ID=${tokenId.toString()}`);
console.log();
console.log(`View: https://hashscan.io/${network}/token/${tokenId.toString()}`);
