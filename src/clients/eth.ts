/**
 * Ethereum (Sepolia) viem clients for buy-sonos and cashout operations.
 * Returns public + wallet clients bound to the platform account.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config";

export interface EthContext {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: ReturnType<typeof privateKeyToAccount>;
}

export function createEthClients(): EthContext {
  const account = privateKeyToAccount(
    config.platform.ethPrivateKey as `0x${string}`,
  );
  const transport = http(config.platform.ethRpc);

  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    chain: sepolia,
    transport,
    account,
  });

  return { publicClient, walletClient, account };
}
