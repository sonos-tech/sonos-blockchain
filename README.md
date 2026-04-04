# sonos-blockchain

Hedera + 0G internal service for Sonos. Bun / TypeScript / Hono.

## Setup

```bash
bun install
```

## Run

```bash
bun run index.ts
```

## Environment Variables

Most config comes from the shared env (ports, token economy, `DYNAMIC_ENV_ID`, `PLATFORM_ETH_ADDRESS`).
This service needs these additional secrets:

### 1. Generate wallet keys

```bash
bun run generate-keys
```

Outputs `ZG_PRIVATE_KEY`, `PLATFORM_ETH_PRIVATE_KEY`, and their addresses.

### 2. Fund the wallets

| Key | Address to fund | Faucet |
|-----|-----------------|--------|
| `ZG_PRIVATE_KEY` | (shown by generate-keys) | https://cloud.google.com/application/web3/faucet/0g/galileo |
| `PLATFORM_ETH_PRIVATE_KEY` | (shown by generate-keys) | https://cloud.google.com/application/web3/faucet/ethereum/sepolia |

### 3. Hedera operator account

Create an **ECDSA** testnet account at https://portal.hedera.com/ and fund it via https://portal.hedera.com/faucet.

| Variable | Source |
|----------|--------|
| `HEDERA_ACCOUNT_ID` | Portal (format `0.0.xxxxx`) |
| `HEDERA_PRIVATE_KEY` | Portal (hex private key) |

### 4. Infura RPC

Sign up at https://www.infura.io/ (free tier), create a Sepolia project.

| Variable | Source |
|----------|--------|
| `PLATFORM_ETH_RPC` | Infura dashboard (format `https://sepolia.infura.io/v3/YOUR_KEY`) |

### 5. Bootstrap scripts (after code is ready)

```bash
bun run create-token     # → SONOS_TOKEN_ID
bun run create-topics    # → SONG_TOPIC_ID + PLAY_LOG_TOPIC_ID
```

These create the $SONOS HTS token and 2 HCS topics on Hedera testnet.

### Explorers

| Chain | Explorer |
|-------|----------|
| Hedera testnet | https://hashscan.io/testnet |
| 0G Galileo | https://chainscan-galileo.0g.ai |
| Sepolia | https://sepolia.etherscan.io |
