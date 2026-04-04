/**
 * Centralized env parsing and validation.
 * All env vars are read once and exported as a typed config object.
 */

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw ? parseInt(raw, 10) : fallback;
}

export const config = {
  // Server
  port: parseInt(process.env.BLOCKCHAIN_PORT || process.env.PORT || "3001"),

  // Hedera operator
  hedera: {
    accountId: required("HEDERA_ACCOUNT_ID"),
    privateKey: required("HEDERA_PRIVATE_KEY"),
    network: optional("HEDERA_NETWORK", "testnet") as "testnet" | "mainnet",
  },

  // $SONOS token
  token: {
    id: required("SONOS_TOKEN_ID"),
  },

  // HCS topics
  topics: {
    songTopicId: required("SONG_TOPIC_ID"),
    playLogTopicId: required("PLAY_LOG_TOPIC_ID"),
  },

  // 0G storage
  zeroG: {
    privateKey: required("ZG_PRIVATE_KEY"),
    rpcUrl: optional("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai"),
    indexerRpc: optional("ZG_INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai"),
  },

  // Platform wallet
  platform: {
    ethAddress: required("PLATFORM_ETH_ADDRESS"),
    ethPrivateKey: required("PLATFORM_ETH_PRIVATE_KEY"),
    ethRpc: required("PLATFORM_ETH_RPC"),
  },

  // Token economy parameters
  economy: {
    uploadCost: optionalInt("UPLOAD_COST", 1000),
    stakePerPlay: optionalInt("STAKE_PER_PLAY", 100),
    minBuyoutPrice: optionalInt("MIN_BUYOUT_PRICE", 5000),
    adReward: optionalInt("AD_REWARD", 25),
    ethToSonosRate: optionalInt("ETH_TO_SONOS_RATE", 100000),
    cashoutFeePercent: optionalInt("CASHOUT_FEE_PERCENT", 5),
    defaultAllowance: optionalInt("DEFAULT_ALLOWANCE", 100000),
  },

  // Hedera mirror node
  mirrorNode: `https://${optional("HEDERA_NETWORK", "testnet")}.mirrornode.hedera.com`,
} as const;

export type Config = typeof config;
