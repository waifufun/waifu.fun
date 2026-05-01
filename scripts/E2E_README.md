# E2E Launch Test - `scripts/e2e-launch.ts`

Comprehensive end-to-end test for the waifu.fun agent-launch flow. Runs the
real orchestrator end-to-end: provisions a Steward agent wallet, mints an
EIP-8004 identity NFT (optional), walks the Four.Meme SIWE + upload + create
API, broadcasts `TokenManager2.createToken`, persists persona rows, and
verifies everything came out right.

> ⚠️ **This burns real BNB** when run against mainnet. The Four.Meme launch
> fee is 0.01 BNB plus gas (≈$6–10 total at today's prices). Use `--dry-run`
> to validate your config without spending anything. Use `--testnet` against
> a testnet deployment if available.

---

## Quick start

```bash
# 1. Pre-flight only, no BNB spent
bun scripts/e2e-launch.ts --dry-run

# 2. Live mainnet launch with default test data
bun scripts/e2e-launch.ts --mainnet

# 3. Custom name/symbol + full verification + cleanup
bun scripts/e2e-launch.ts \
  --mainnet \
  --name "HelloAgent" --symbol HELLO \
  --check-events --check-8004 \
  --cleanup
```

Run from the repo root (`waifu-core/`).

---

## Required env vars

Set these in `.env` at the repo root (or export before running):

| var | required | example |
|-----|----------|---------|
| `STEWARD_API_URL` | ✓ | `https://eliza.steward.fi` |
| `STEWARD_API_KEY` *(or `STEWARD_TENANT_API_KEY`)* | ✓ | `stw_live_...` |
| `STEWARD_TENANT_ID` | optional (default `waifu`) | `waifu` |
| `BSC_RPC_URL` | ✓ | `https://bsc-dataseed.binance.org` |
| `FOURMEME_API_URL` | ✓ | `https://four.meme/meme-api` |
| `FOURMEME_TOKEN_MANAGER_2` | ✓ | `0x5c952063c7fc8610FFDB798152D69F0B9550762b` |
| `FOURMEME_CHAIN_ID` | ✓ | `56` (mainnet) or `97` (testnet) |
| `EIP8004_NFT_ADDRESS` | ✓ | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| `DATABASE_URL` | optional | `postgres://…` (enables persona + cleanup checks) |
| `WAIFU_API_URL` | optional (default `http://localhost:3100`) | `https://waifu.fun/api` |

The script will fail fast with a clear error if any required var is missing.

---

## CLI flags

| flag | description |
|------|-------------|
| `--help`, `-h` | print usage |
| `--name <s>` | token name (default `TestAgent`) |
| `--symbol <s>` | token symbol (default `TST`) |
| `--description <s>` | token description |
| `--mainnet` | require chainId 56. Required to actually launch on mainnet (guardrail). |
| `--testnet` | require chainId 97 |
| `--dry-run` | pre-flight only, do NOT call orchestrator. No BNB spent. |
| `--skip-8004` | pass `skipIdentityRegistration=true` (skip NFT mint) |
| `--check-8004` | after launch, call `ownerOf(agentId)` on the NFT contract and assert == wallet |
| `--check-events` | poll `agent_events` table for the indexer to enqueue `agent.created` |
| `--indexer-wait-ms <n>` | max time to wait for indexer (default 60000) |
| `--cleanup` | delete DB rows for this agent after test (on-chain token is permanent) |

You can also set `SKIP_8004=true` in env instead of `--skip-8004`.

---

## What it does, step by step

1. **Pre-flight checks** - env vars present, Steward reachable, BSC RPC chain
   id matches, Four.Meme reachable, DB reachable (if DATABASE_URL set),
   waifu API reachable (optional).
2. **Mainnet guardrail** - if chainId 56 and neither `--mainnet` nor
   `--dry-run` passed, refuse to launch and exit 2.
3. **Orchestrator run** - constructs the real `AgentLaunchOrchestrator` with
   the real Steward client. Each `onStep` callback logs with color and
   elapsed time:
   - `steward.provision` - create/fetch agent wallet
   - `identity.register` - mint EIP-8004 NFT *(unless `--skip-8004`)*
   - `fourmeme.login` - SIWE auth
   - `fourmeme.upload` - push the 1×1 PNG
   - `fourmeme.create` - get `(createArg, signature)`
   - `chain.broadcast` - Steward signs + broadcasts
   - `chain.receipt` - wait for receipt, parse `TokenCreate`
   - `persona.write` / `persona.setToken` - DB writes (if DATABASE_URL)
4. **Post-launch assertions**
   - `GET /v2/agents/:tokenAddress` returns the agent
   - `GET /v2/agents/:tokenAddress/trades` returns `{trades: []}`
   - Tx receipt has `TokenManager2` logs
   - *(with `--check-8004`)* NFT `ownerOf(agentId) == wallet`
   - *(with `--check-events`)* indexer enqueued `agent.created` in `agent_events`
5. **Summary block** - token addresses, tx hash, 4.meme URL, waifu.fun URL.
6. **Cleanup** *(with `--cleanup`)* - deletes rows from `agent_personas`,
   `agent_wallets`, `agent_events` for this agent id. The on-chain token is
   **permanent** and cannot be cleaned up.

---

## Common errors and fixes

### `missing required env vars: - STEWARD_API_URL ...`
Your `.env` isn't sourced. Either `export` them in your shell, or run with
`node --env-file=.env node_modules/.bin/tsx scripts/e2e-launch.ts ...`.

### Pre-flight: `steward returned 401` / `403`
API key is wrong or the tenant id doesn't match. Check `STEWARD_API_KEY`
and `STEWARD_TENANT_ID`.

### Pre-flight: `RPC chainId 56 != FOURMEME_CHAIN_ID 97`
Your RPC is on a different chain than the orchestrator is configured for.
Point `BSC_RPC_URL` at a testnet RPC like
`https://data-seed-prebsc-1-s1.binance.org:8545/` for chainId 97.

### `steward.provision` fails with `403` or `policy`
Tenant doesn't have wallet-creation permissions. Check the Steward dashboard
or ask the Steward team to enable agent creation for your tenant.

### `identity.register` reverts on chain
The EIP-8004 contract may require you to be an approved registrar, or the
contract at `EIP8004_NFT_ADDRESS` is wrong. Double-check the address
against the canonical BSC deployment
(`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`). You can skip this step with
`--skip-8004` to unblock the rest of the flow.

### `fourmeme.login` fails with `SIWE` / `invalid signature`
The Steward-signed message nonce is out of sync, or the signer is the wrong
EOA. Usually caused by Steward returning a signature for a different
address than the one we think we own. Re-provision the agent
(`--cleanup` followed by a fresh run) or inspect the Steward agent.

### `fourmeme.create` returns `code=1001` or `code=1000`
Four.Meme API rejected the token metadata. Common causes:
- Name or symbol already taken (try `--symbol` with a unique suffix)
- Image upload URL expired (re-run)
- Tax config invalid (feeRate must be 1, 3, 5, or 10)

### `chain.broadcast` fails with `insufficient funds`
The agent wallet doesn't have enough BNB. You need **at least 0.015 BNB**
(0.01 launch fee + ~0.005 for gas). Fund the wallet address printed in the
`steward.provision` step output.

### `chain.receipt` times out (180s)
BSC RPC is slow or dropped the tx. Check the tx hash on BscScan - if it's
there with status success, the orchestrator's wait just timed out; you can
re-run with `RECEIPT_TIMEOUT_MS=300000` hacked in if needed. If the tx was
never broadcast, check Steward logs.

### `chain.receipt`: `could not locate TokenCreate event`
The tx succeeded but emitted no `TokenCreate` from TokenManager2. Almost
always means `FOURMEME_TOKEN_MANAGER_2` is pointed at the wrong address
(e.g. a V1 manager). The canonical V2 mainnet address is
`0x5c952063c7fc8610FFDB798152D69F0B9550762b`.

### `--check-events`: `timeout - no agent.created event observed`
The indexer isn't running, or isn't pointed at the same DB. Check
`apps/evm-indexer` is up and has caught up past the launch block. Increase the
timeout with `--indexer-wait-ms 180000`.

### `--check-8004`: `owner=... != wallet=...`
The NFT minted to a different address than expected. Usually means the
wallet addresses got shuffled - double-check by re-running with
`--skip-8004` first to isolate.

---

## Exit codes

| code | meaning |
|------|---------|
| 0 | all steps + assertions passed |
| 1 | launch failed, or launch succeeded but one or more assertions failed |
| 2 | safety guardrail tripped (mainnet without `--mainnet`) |

---

## Safety notes

- The script defaults to a **1×1 pixel PNG**. Four.Meme accepts this but the
  token listing will be ugly. Real launches should pass a proper image URL
  (there's no `--image` flag yet - edit the script or add one).
- The script **never calls Four.Meme with `preSale > 0`** - no creator-buys.
- The script always uses `feePlan: false` (flat fee) and label `AI`.
- Each run creates a **permanent on-chain token**. Don't run this for fun.
  Use `--dry-run` for config iteration.
