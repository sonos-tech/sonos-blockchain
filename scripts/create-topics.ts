/**
 * Creates 2 HCS topics on Hedera testnet for Sonos.
 *
 * Requires env: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_NETWORK
 * Outputs: SONG_TOPIC_ID, PLAY_LOG_TOPIC_ID
 */
import {
  Client,
  PrivateKey,
  AccountId,
  TopicCreateTransaction,
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

async function createTopic(memo: string): Promise<string> {
  const tx = new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(operatorKey.publicKey);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return receipt.topicId!.toString();
}

console.log("Creating HCS topics...");
console.log(`  Operator: ${accountId}`);
console.log(`  Network:  ${network}`);
console.log();

const songTopicId = await createTopic("sonos:songs");
const playLogTopicId = await createTopic("sonos:play-log");

console.log("=== HCS Topics Created ===");
console.log(`SONG_TOPIC_ID=${songTopicId}`);
console.log(`PLAY_LOG_TOPIC_ID=${playLogTopicId}`);
console.log();
console.log(`View songs:    https://hashscan.io/${network}/topic/${songTopicId}`);
console.log(`View play-log: https://hashscan.io/${network}/topic/${playLogTopicId}`);
