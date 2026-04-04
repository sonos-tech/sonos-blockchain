/**
 * 0G storage client setup.
 * Returns a ZeroGContext ready for upload / download operations.
 */
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import { config } from "../config";

export interface ZeroGContext {
  provider: ethers.JsonRpcProvider;
  signer: ethers.Wallet;
  indexer: Indexer;
  /** Needed as a parameter for `indexer.upload(file, rpcUrl, signer)`. */
  rpcUrl: string;
}

export function create0gContext(): ZeroGContext {
  const provider = new ethers.JsonRpcProvider(config.zeroG.rpcUrl);
  const signer = new ethers.Wallet(config.zeroG.privateKey, provider);
  const indexer = new Indexer(config.zeroG.indexerRpc);

  return { provider, signer, indexer, rpcUrl: config.zeroG.rpcUrl };
}
