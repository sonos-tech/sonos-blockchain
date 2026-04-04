/**
 * Test: Upload a song to 0G storage and print the root hash.
 *
 * Reads from .env: ZG_PRIVATE_KEY, ZG_RPC_URL, ZG_INDEXER_RPC
 * Usage: bun run test:0g-upload
 */
import { ZgFile, Indexer } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import path from "path";

const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY;
const ZG_RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";

if (!ZG_PRIVATE_KEY) {
  console.error("Missing ZG_PRIVATE_KEY in .env");
  process.exit(1);
}

const songPath = path.resolve(import.meta.dir, "../res/test_songs/1.mp3");

console.log("=== 0G Upload Test ===");
console.log(`File:    ${songPath}`);
console.log(`RPC:     ${ZG_RPC_URL}`);
console.log(`Indexer: ${ZG_INDEXER_RPC}`);
console.log();

const provider = new ethers.JsonRpcProvider(ZG_RPC_URL);
const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
const indexer = new Indexer(ZG_INDEXER_RPC);

console.log(`Wallet:  ${signer.address}`);
const balance = await provider.getBalance(signer.address);
console.log(`Balance: ${ethers.formatEther(balance)} 0G`);
console.log();

// Upload
console.log("Opening file...");
const file = await ZgFile.fromFilePath(songPath);
const [tree, treeErr] = await file.merkleTree();
if (treeErr || !tree) {
  console.error("Failed to build merkle tree:", treeErr);
  process.exit(1);
}

const rootHash = tree.rootHash();
console.log(`Root hash: ${rootHash}`);
console.log();

console.log("Uploading to 0G...");
const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer);
await file.close();

if (uploadErr) {
  console.error("Upload failed:", uploadErr);
  process.exit(1);
}

console.log();
console.log("=== Upload Complete ===");
console.log(`ROOT_HASH=${rootHash}`);
console.log(`TX: ${tx}`);
console.log();
console.log("Use this hash to test download:");
console.log(`  ROOT_HASH=${rootHash} bun run test:0g-download`);
