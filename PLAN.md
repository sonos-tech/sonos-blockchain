# sonos-blockchain Implementation Plan

Internal Hono/Bun service wrapping Hedera HTS/HCS + 0G storage behind a REST API.

## Architecture

```
sonos-web  ──REST──>  sonos-back (Rust)  ──internal REST──>  sonos-blockchain (this)
                                                                  │
                                                          ┌───────┼───────┐
                                                     Hedera SDK   0G SDK  viem
                                                     (HTS/HCS)  (storage) (ETH)
```

All blockchain SDKs live here. sonos-back calls via `http://localhost:3001/internal/*`.

## Token: $SONOS (HTS)

- Token ID: `0.0.8509404` | Decimals: 2 | 100 units = 1.00 SONOS
- 2% fractional fee auto-collected by HTS (treasury exempt)
- Supply/Wipe/Admin keys = operator key

## Economy

| Action | Cost | Env Var |
|--------|------|---------|
| Play a song | 1.00 SONOS (100) | STAKE_PER_PLAY |
| Upload a song | 10.00 SONOS (1000) | UPLOAD_COST |
| Buyout minimum | 50.00 SONOS (5000) | MIN_BUYOUT_PRICE |
| Ad reward | 0.25 SONOS (25) | AD_REWARD |
| ETH rate | 1000 SONOS/ETH (100000) | ETH_TO_SONOS_RATE |
| Cashout fee | 5% | CASHOUT_FEE_PERCENT |

## User Account Model

Dynamic gives EVM wallets. Hedera needs account IDs + keys. Solution:
- Operator creates Hedera accounts for users, holds keys
- Maps EVM address -> {hederaAccountId, privateKey}
- On onboarding: create account + associate $SONOS + grant allowance
- Persisted to `data/accounts.json`

## Endpoints

### Token (`/internal/token/`)

| Method | Path | Body | What |
|--------|------|------|------|
| POST | /mint | {amount} | Mint to treasury |
| POST | /wipe | {accountId, amount} | Burn from user |
| POST | /transfer | {from, to, amount} | Transfer between accounts |
| POST | /transfer-approved | {from, to, amount} | Transfer via allowance (no user sig) |
| POST | /associate | {evmAddress} | Create + associate + allowance (onboarding) |
| POST | /allowance | {evmAddress, amount} | Top-up allowance |
| GET | /balance/:accountId | - | Mirror Node balance query |

### Storage (`/internal/storage/`)

| Method | Path | Body | What |
|--------|------|------|------|
| POST | /upload | multipart file | Upload to 0G, return rootHash |
| POST | /upload-memory | buffer | Upload buffer to 0G |
| GET | /download/:rootHash | - | Download from 0G, stream back |
| POST | /prefetch/:rootHash | - | Download to cache for later |

### HCS (`/internal/hcs/`)

| Method | Path | Body | What |
|--------|------|------|------|
| POST | /submit | {topicId, message} | Submit to HCS topic |
| GET | /messages/:topicId | ?limit=&order= | Read from Mirror Node |

### Songs (`/internal/song/`)

| Method | Path | Body | What |
|--------|------|------|------|
| POST | /upload | multipart + metadata | ffmpeg + 0G x2 + wipe + HCS |
| GET | /songs | - | All songs from HCS |
| GET | /previews | - | Preview data for caching |

### Swap (`/internal/swap/`)

| Method | Path | Body | What |
|--------|------|------|------|
| POST | /buy-sonos | {txHash, ethAmount, evmAddress} | Verify ETH + mint + transfer |
| POST | /cashout | {evmAddress, sonosAmount} | Transfer to treasury + send ETH |
| POST | /verify-eth | {txHash, expectedAmount, expectedFrom} | Verify only |
| POST | /send-eth | {to, amount} | Send ETH only |

### Health

| Method | Path | What |
|--------|------|------|
| GET | /internal/health | Service health check |

## Economy Flow Map

| Flow | Endpoint(s) | On-chain |
|------|------------|----------|
| Onboard user | POST /token/associate | Create account + associate + allowance |
| Buy $SONOS | POST /swap/buy-sonos | Verify ETH -> mint -> transfer to user |
| Upload song | POST /song/upload | 0G x2 -> wipe from artist -> HCS log |
| Stake to play | POST /token/transfer-approved | Listener->treasury via allowance |
| Confirm play | POST /token/transfer + /hcs/submit | Treasury->artist (2% auto) + log |
| Refund stake | POST /token/transfer | Treasury->listener (fee-exempt) |
| Buyout | POST /token/transfer-approved + /hcs/submit | Listener->artist (2% auto) + log |
| Donation | POST /token/transfer-approved | Listener->artist (2% auto) |
| Cashout | POST /swap/cashout | SONOS->treasury + ETH send (minus 5%) |
| Ad reward | POST /token/mint + /token/transfer | Mint + treasury->user |

## Build Phases

1. **Foundation** - config, clients, Hono server, health
2. **Token ops** - Hedera service, Mirror Node, accounts, token routes
3. **Storage + HCS** - 0G wrappers, HCS routes
4. **Song upload** - composite flow, song listing
5. **Swap** - ETH buy/cashout composites
