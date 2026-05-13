# Wave H — `newTokenV7` characterization probe

Empirical probe of Flap Portal `newTokenV7` and `newTokenV6` on BSC mainnet,
run against an anvil fork at block 97368808. Companion to the cooldown probe
and the original bundle probe.

## TL;DR

- `newTokenV7` **does not exist** on Portal v5.14.1 (selector `0x4d850269`
  returns empty revert data, indistinguishable from a bogus selector).
- `newTokenV6` is the recommended path. It exposes per-token
  `commissionReceiver` which routes ~6% of the post-fee tax to a custom
  address (us).
- Cooldown, beneficiary, and graduation semantics on V6 are documented in
  `~/.moltbot/projects/steward/FLAP_BUNDLE_PROBE_FINDINGS.md` § V6/V7
  characterization (2026-05-13).

## Run

```bash
# 1. Start anvil fork
PATH=$HOME/.foundry/bin:$PATH anvil \
  --fork-url "$ALCHEMY_BSC_URL" \
  --fork-block-number 97368808 \
  --chain-id 56 --host 127.0.0.1 --port 8546 \
  --balance 1000 > /tmp/anvil-v7.log 2>&1 &

# 2. Run probes (order matters; each consumes anvil state)
node probe/v6-v7-characterization.cjs       # full sweep
node probe/v6-followup.cjs                  # fixes for the two bugs in the sweep
node probe/v6-cooldown-and-beneficiary.cjs  # narrow cooldown + beneficiary check
node probe/v6-wrapper-beneficiary.cjs       # EOA beneficiary mismatch test
```

Each script writes a `*.json` next to itself with structured results.

## Findings shorthand

| script | finding |
|--------|---------|
| `v6-v7-characterization.cjs` EXP 0 | V7 does not exist |
| `v6-v7-characterization.cjs` EXP 1 | V6 with `commissionReceiver=EOA` works; processor exposes commissionReceiver/commissionBps/feeReceiver |
| `v6-v7-characterization.cjs` EXP 5 | 16 BNB → status=1, 20 BNB → status=4 (graduated). Same as V2. |
| `v6-followup.cjs` EXP 4r | commissionReceiver param flows to `taxProcessor.commissionReceiver()` |
| `v6-followup.cjs` EXP 6r | After buy + sell + `dispatch()`, the custom commissionReceiver received +0.01076 BNB (16% of total fee flow) |
| `v6-cooldown-and-beneficiary.cjs` CD2 | Same `RateLimitExceeded(tx.origin, unlockTime)` as V2; selector `0xa7382e9b` |
| `v6-wrapper-beneficiary.cjs` BC2 | V6 with `beneficiary != msg.sender` succeeds but tokens still go to `msg.sender` (different from V2 silent revert) |

## Param gotchas (only fail mode in the sweep)

- `dexThresh` MUST be `1` (FOUR_FIFTHS). Other enums revert
  `InvalidDexThresholdType` (selector `0x77146b42`).
- `antiFarmerDuration` MUST be ≥ 86400 (1 day). Shorter reverts
  `AntiFarmerDurationTooShort` (selector `0x34fe4bd5`).
- `tokenVersion` MUST be `6` for tax tokens with commission.
- Salt must produce vanity suffix `7777` for tax tokens.
- Tax token V3 impl (for CREATE2): `0x024f18294970B5c76c0691b87f138A0317156422`.
