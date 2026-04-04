# sonos-blockchain — Agent Reference

Internal blockchain microservice for the Sonos decentralized music platform. Wraps all blockchain SDK interactions (Hedera HTS/HCS, 0G storage, Sepolia ETH) behind an HTTP API that sonos-back (Rust) calls via reqwest.

## Quick Start

```bash
bun install
bun run dev          # http://localhost:3001 (hot reload, reads .env)
bun run start        # production
bun run test         # blockchain tests (free, no 0G credits)
bun run test:storage # storage tests (uses 0G credits)
```

Server must be running before tests — tests hit the live HTTP API, not unit tests.

## Architecture

```
sonos-back (Rust/Axum :8080)
    │
    │  reqwest HTTP calls
    ▼
sonos-blockchain (Bun/Hono :3001)     ← this service
    │         │          │
    ▼         ▼          ▼
  Hedera    0G         Sepolia
  Testnet   Storage    (viem)
```

No blockchain SDKs exist in sonos-back or sonos-web. This service is the sole gateway.

## Project Structure

```
src/
├── index.ts                 # Hono entrypoint — mounts all routes, top-level balance endpoint
├── config.ts                # Env parsing — port, hedera, token, topics, zeroG, platform, economy, mirrorNode
├── context.ts               # Module-level singletons: hedera, zeroG, eth (imported by services/routes)
├── types.ts                 # All request/response types + ApiResponse<T> envelope
├── clients/
│   ├── hedera.ts            # createHederaContext() → {client, operatorId, operatorKey, tokenId}
│   ├── 0g.ts                # create0gContext() → {provider, signer, indexer, rpcUrl}
│   └── eth.ts               # createEthClients() → {publicClient, walletClient, account}
├── services/
│   ├── hedera.ts            # All HTS + HCS operations (8 exported functions)
│   ├── mirror.ts            # Mirror Node REST queries (balance, HCS messages, account info)
│   ├── storage.ts           # 0G upload/download with tuple error handling
│   └── accounts.ts          # EVM→Hedera account bridge (Map + JSON persistence + race locks)
├── routes/
│   ├── health.ts            # GET /health
│   ├── token.ts             # Mint, wipe, transfer, transfer-approved, associate, allowance, balance
│   ├── storage.ts           # Upload (multipart), upload-memory (buffer), download, prefetch
│   ├── hcs.ts               # Submit message, read messages
│   ├── songs.ts             # Composite song upload, song listing, preview listing
│   └── swap.ts              # Buy-sonos, cashout, verify-eth, send-eth
tests/
├── blockchain.test.ts       # 26 tests — Hedera ops, HCS, validation (free)
└── storage.test.ts          # 10 tests — 0G upload/download, composite song upload (costs credits)
data/
└── accounts.json            # Auto-created, persists EVM→Hedera account mappings
```

## API Endpoints

All routes are prefixed with `/internal/`. Every response uses `ApiResponse<T>`:
```typescript
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string }
```

### Token (`/internal/token/`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/token/mint` | `{amount}` | `{transactionId}` | Mints to treasury. Operator key = supply key. |
| POST | `/token/wipe` | `{accountId, amount}` | `{transactionId, status}` | Burns from non-treasury account. |
| POST | `/token/transfer` | `{from, to, amount}` | `{transactionId, status}` | If `from` is not treasury, looks up managed account key via `getAccountByHederaId`. |
| POST | `/token/transfer-approved` | `{from, to, amount}` | `{transactionId, status}` | Uses `addApprovedTokenTransfer`. No sender signature needed (operator is approved spender). |
| POST | `/token/associate` | `{evmAddress}` | `{hederaAccountId, alreadyExisted}` | Creates Hedera account + associates $SONOS + grants default allowance. Idempotent. |
| POST | `/token/allowance` | `{evmAddress, amount}` | `{transactionId, status}` | Top-up operator allowance for a user. |
| GET | `/token/balance/:accountId` | — | `{accountId, balance}` | Via Mirror Node. Also available at `/internal/balance/:accountId`. |

### Storage (`/internal/storage/`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/storage/upload` | multipart `file` field | `{rootHash}` | Writes to temp, uploads to 0G, cleans up. ~60-120s. |
| POST | `/storage/upload-memory` | raw binary body | `{rootHash}` | For buffer uploads (preview clips). |
| GET | `/storage/download/:rootHash` | — | audio/mpeg binary | Downloads from 0G, streams back, cleans up temp. |
| POST | `/storage/prefetch/:rootHash` | — | `{cached: boolean}` | Downloads to persistent cache dir. Returns `cached:true` on second call. |

### HCS (`/internal/hcs/`)

| Method | Path | Body/Query | Response | Notes |
|--------|------|------------|----------|-------|
| POST | `/hcs/submit` | `{topicId, message}` | `{transactionId, sequenceNumber}` | JSON.stringify'd, operator key signs. Max 1024 bytes. |
| GET | `/hcs/messages/:topicId` | `?limit=100&order=asc` | `HcsMessage[]` | Base64-decoded from Mirror Node. |

### Songs (`/internal/song/` and `/internal/`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/song/upload` | multipart: `file`, `title`, `artist` (EVM), `genre`, `duration`, `buyoutPrice` | `{songId, transactionId}` | Full orchestration: resolve artist → check balance → 0G upload x2 → wipe tokens → HCS log. |
| GET | `/songs` | `?limit=100` | `SongRecord[]` | Reads HCS song topic, parses metadata. Also at `/song/songs`. |
| GET | `/previews` | — | `[{songId, title, artist, previewRootHash}]` | For sonos-back to batch-download previews on startup. Also at `/song/previews`. |

### Swap (`/internal/swap/`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/swap/buy-sonos` | `{txHash, ethAmount, evmAddress}` | `{sonosMinted, transactionId}` | Composite: verify ETH on Sepolia → mint $SONOS → transfer to user. |
| POST | `/swap/cashout` | `{evmAddress, sonosAmount}` | `{ethSent, fee, txHash}` | Composite: transfer $SONOS to treasury via allowance → send ETH minus 5% fee. |
| POST | `/swap/verify-eth` | `{txHash, expectedAmount?, expectedFrom?}` | `{verified, from, value, reason?}` | Building block: verify Sepolia tx receipt. |
| POST | `/swap/send-eth` | `{to, amount}` | `{txHash}` | Building block: send ETH from platform wallet. |

### Other

| Method | Path | Response |
|--------|------|----------|
| GET | `/internal/health` | `{status, timestamp, service}` |
| GET | `/internal/balance/:accountId` | `{accountId, balance}` |

## Key Design Decisions

### Server-Managed Hedera Accounts

Dynamic gives users EVM wallets, but Hedera HTS needs Hedera account IDs + ECDSA keys for signing. Solution: the operator creates Hedera accounts, holds private keys, and maps `EVM address → Hedera account`.

- **Map**: `services/accounts.ts` — in-memory `Map<string, ManagedAccount>`, keyed by lowercase EVM address
- **Persistence**: `data/accounts.json` — written on every mutation via `Bun.write()`
- **Race protection**: per-address `Promise` locks prevent double-creation
- **Onboarding**: `getOrCreateAccount()` does: `createAccount()` → `associateToken()` → `approveAllowance(DEFAULT_ALLOWANCE)` → persist
- **Reverse lookup**: `getAccountByHederaId()` iterates map values (used by `/token/transfer` when `from` is a Hedera ID)

### SDK Client Singletons

`context.ts` exports module-level singletons initialized once at import:
```typescript
export const hedera = createHederaContext();  // {client, operatorId, operatorKey, tokenId}
export const zeroG = create0gContext();       // {provider, signer, indexer, rpcUrl}
export const eth = createEthClients();        // {publicClient, walletClient, account}
```

### Hedera Service Pattern

All HTS/HCS functions in `services/hedera.ts` follow:
```
build tx → freezeWith(client) → sign(key) → execute(client) → getReceipt(client) → TxResult
```

8 exported functions:

| Function | Hedera TX | Who Signs |
|----------|-----------|-----------|
| `mintTokens(amount)` | `TokenMintTransaction` | operatorKey (supply key) |
| `wipeTokens(accountId, amount)` | `TokenWipeTransaction` | operatorKey (wipe key) |
| `transferTokens(from, to, amount, fromKey?)` | `TransferTransaction` | fromKey or operatorKey |
| `transferApproved(from, to, amount)` | `TransferTransaction` + `addApprovedTokenTransfer` | operatorKey (approved spender) |
| `associateToken(accountId, accountKey)` | `TokenAssociateTransaction` | accountKey |
| `approveAllowance(ownerId, ownerKey, amount)` | `AccountAllowanceApproveTransaction` | ownerKey |
| `createAccount()` | `AccountCreateTransaction` (ECDSA, 1 HBAR) | operatorKey |
| `submitHcsMessage(topicId, message)` | `TopicMessageSubmitTransaction` | operatorKey |

### 0G Storage Error Handling

The 0G SDK does NOT throw exceptions. It returns `[result, error]` tuples. Always check both:
```typescript
const [tree, treeErr] = await file.merkleTree();
if (treeErr || !tree) throw ...;
const rootHash = tree.rootHash();
if (!rootHash) throw ...;  // Can be null!
const [_tx, uploadErr] = await indexer.upload(file, rpcUrl, signer);
if (uploadErr) ...;
```

**Known behaviors:**
- Re-uploading an identical file causes "Transaction reverted" — treated as success (file already exists on 0G)
- Two concurrent uploads from the same wallet cause "replacement transaction underpriced" — uploads must be sequential
- Upload takes 60-120s for a ~1MB file
- `indexer.download(rootHash, outputPath, true)` returns an error value (not tuple)

### Mirror Node

Read-only REST queries via `services/mirror.ts`. No SDK needed — plain `fetch()`.
- Balance: `GET /api/v1/accounts/{id}/tokens?token.id={tokenId}`
- HCS messages: `GET /api/v1/topics/{topicId}/messages?limit=N&order=asc|desc` — base64-decode `message` field
- Account info: `GET /api/v1/accounts/{id}`
- **3-5 second delay** after writes before reads reflect the new state

### Token Economy

All amounts are in **internal units** (100 = 1.00 SONOS, 2 decimals).

| Parameter | Default | Env Var |
|-----------|---------|---------|
| Upload cost | 1000 (10 SONOS) | `UPLOAD_COST` |
| Stake per play | 100 (1 SONOS) | `STAKE_PER_PLAY` |
| Min buyout price | 5000 (50 SONOS) | `MIN_BUYOUT_PRICE` |
| Ad reward | 25 (0.25 SONOS) | `AD_REWARD` |
| ETH→SONOS rate | 100000 | `ETH_TO_SONOS_RATE` |
| Cashout fee | 5% | `CASHOUT_FEE_PERCENT` |
| Default allowance | 100000 | `DEFAULT_ALLOWANCE` |

The 2% platform fee is automatic via HTS custom fees — no code needed. Treasury is auto-exempt from fees.

## Environment Variables

Required in `.env` (loaded via `bun --env-file=.env`):

```
HEDERA_ACCOUNT_ID=0.0.8507361
HEDERA_PRIVATE_KEY=302e...
HEDERA_NETWORK=testnet
SONOS_TOKEN_ID=0.0.8509404
SONG_TOPIC_ID=0.0.8509451
PLAY_LOG_TOPIC_ID=0.0.8509453
ZG_PRIVATE_KEY=0x...
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
PLATFORM_ETH_ADDRESS=0x...
PLATFORM_ETH_PRIVATE_KEY=0x...
PLATFORM_ETH_RPC=https://sepolia.infura.io/v3/...
BLOCKCHAIN_PORT=3001  (optional, defaults to 3001)
```

Economy vars are optional (have defaults in `config.ts`).

## Testing

Tests require the server to be running (`bun run dev` in another terminal).

```bash
bun run test           # 26 blockchain tests (~35s, free)
bun run test:storage   # 10 storage tests (~110s, uses 0G credits)
bun run test:all       # both suites
```

**blockchain.test.ts** covers: health, validation (7 error paths), mint, associate (+ idempotency), transfer, balance, transfer-approved, wipe, allowance, HCS submit/read (2 topics), swap validation (5 error paths), songs listing.

**storage.test.ts** covers: 0G upload/download/prefetch/cache, composite song upload (0G x2 + wipe + HCS), song listing after upload, balance decrease verification. Uses `res/test_songs/2.mp3` (1.3MB) to minimize credit usage.

## How sonos-back Uses This Service

Every economy flow maps to endpoint calls:

| App Flow | sonos-back calls |
|----------|-----------------|
| User onboarding | `POST /token/associate {evmAddress}` |
| Buy $SONOS | `POST /swap/buy-sonos {txHash, ethAmount, evmAddress}` |
| Upload song | `POST /song/upload {file, metadata}` |
| Stake to play | `POST /token/transfer-approved {from:listener, to:treasury, amount:100}` |
| Confirm play | `POST /token/transfer {from:treasury, to:artist}` + `POST /hcs/submit` |
| Refund stake | `POST /token/transfer {from:treasury, to:listener}` |
| Song buyout | `POST /token/transfer-approved {from:listener, to:artist, amount:buyoutPrice}` + `POST /hcs/submit` |
| Donation | `POST /token/transfer-approved {from:listener, to:artist}` |
| Cashout | `POST /swap/cashout {evmAddress, sonosAmount}` |
| Ad reward | `POST /token/mint` + `POST /token/transfer {from:treasury, to:user}` |
| Get balance | `GET /balance/:accountId` |
| Get songs | `GET /songs` |
| Get previews | `GET /previews` |
| Stream full song | `GET /storage/download/:rootHash` |
| Prefetch song | `POST /storage/prefetch/:rootHash` |

## Common Pitfalls

- **Always `await getReceipt()`** after Hedera `execute()` — without it, the tx may silently fail at consensus
- **0G tuples** — SDK returns `[result, error]`, never throws. Always check error AND null-check the result
- **0G concurrent uploads** — same wallet can't sign two uploads in parallel (nonce collision). Run sequentially.
- **0G re-uploads** — uploading an identical file causes "Transaction reverted". Handled in `services/storage.ts`.
- **Mirror Node delay** — 3-5 seconds after a write before reads reflect the change. Tests add `sleep(6000)` for this.
- **Token association required** — any account must be associated with $SONOS before it can receive transfers. The `/token/associate` endpoint handles this.
- **Treasury is fee-exempt** — transfers FROM treasury (refunds, rewards) don't incur the 2% auto-fee
- **HCS 1024 byte limit** — song metadata JSON must stay under this (typical ~300 bytes)
- **`file.name` on Bun** — `Bun.file(absolutePath).name` preserves the full absolute path. Use `basename()` when constructing temp filenames.
- **`--env-file=.env`** required in all bun commands — env vars are not auto-loaded

## Scripts

```bash
bun run generate-keys       # Generate ECDSA key pairs
bun run create-token        # Create $SONOS token on Hedera (run once)
bun run create-topics       # Create HCS topics (run once)
bun run test:0g-upload      # Manual 0G upload test
bun run test:0g-download    # Manual 0G download test (needs ROOT_HASH env)
bun run test:hedera-client  # Manual Hedera client test
```
