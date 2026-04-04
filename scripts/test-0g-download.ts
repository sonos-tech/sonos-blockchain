/**
 * Test: Download a file from 0G storage by root hash.
 *
 * Reads from .env: ZG_INDEXER_RPC
 * Requires: ROOT_HASH env var (from upload test output)
 * Usage: ROOT_HASH=0x... bun run test:0g-download
 */
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import path from "path";

const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
const ROOT_HASH = process.env.ROOT_HASH;

if (!ROOT_HASH) {
  console.error("Missing ROOT_HASH. Run test:0g-upload first and pass the hash:");
  console.error("  ROOT_HASH=0x... bun run test:0g-download");
  process.exit(1);
}

const outputPath = path.resolve(import.meta.dir, "../res/test_songs/downloaded.mp3");

console.log("=== 0G Download Test ===");
console.log(`Root hash: ${ROOT_HASH}`);
console.log(`Indexer:   ${ZG_INDEXER_RPC}`);
console.log(`Output:    ${outputPath}`);
console.log();

const indexer = new Indexer(ZG_INDEXER_RPC);

console.log("Downloading from 0G...");
const err = await indexer.download(ROOT_HASH, outputPath, true);

if (err) {
  console.error("Download failed:", err);
  process.exit(1);
}

console.log();
console.log("=== Download Complete ===");
console.log(`Saved to: ${outputPath}`);
console.log("Play it to verify: open the file or use a media player.");
