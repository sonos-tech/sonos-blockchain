/**
 * 0G decentralized storage service.
 *
 * Wraps upload and download operations using the 0G SDK.
 * The SDK returns [result, error] tuples — we check both and throw on failure.
 */

import { ZgFile } from "@0gfoundation/0g-ts-sdk";
import { zeroG } from "../context";

const { indexer, rpcUrl, signer } = zeroG;

/**
 * Upload a file from a local path to 0G storage.
 *
 * @param filePath - Absolute path to the file on disk.
 * @returns The merkle root hash identifying the file on 0G.
 */
export async function uploadFile(filePath: string): Promise<string> {
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`Merkle tree failed: ${treeErr}`);
    }

    const rootHash = tree.rootHash();
    if (!rootHash) {
      throw new Error("Root hash is null");
    }

    const [_tx, uploadErr] = await indexer.upload(file, rpcUrl, signer);
    if (uploadErr) {
      throw new Error(`0G upload failed: ${uploadErr}`);
    }

    return rootHash;
  } finally {
    await file.close();
  }
}

/**
 * Download a file from 0G storage to a local path.
 *
 * @param rootHash   - The merkle root hash of the file.
 * @param outputPath - Local path to write the downloaded file.
 */
export async function downloadFile(
  rootHash: string,
  outputPath: string,
): Promise<void> {
  const err = await indexer.download(rootHash, outputPath, true);
  if (err) {
    throw new Error(`0G download failed: ${err}`);
  }
}
