# Echidna Property-Based Fuzzing

This folder holds the Echidna fuzz harness layered on top of the Hardhat unit suite.
Hardhat remains the primary test runner; Foundry (`foundry.toml` at the package root)
exists so Echidna 2.x has a compilable Solidity project to consume.

## Why

Static analysis (Slither) and 81 unit + 29 adversarial + 26 e2e bundle tests cover
the known-unknowns. Echidna scans the state space at random within a 50000-call
budget per harness to surface unknown-unknowns: arithmetic edge cases, state
transitions the unit suite never exercised, accounting drift under repeated
deposit/withdraw cycles. Additive to the audit package, not a replacement.

## Layout

```
packages/contracts-evm/
  foundry.toml                      # Foundry profile (solc 0.8.24, viaIR, runs 200)
  echidna.yaml                      # Echidna fuzz config
  test-echidna/
    EchidnaTreasuryLP.sol           # custody contract: managed-token lock, owner-only sweep, no raw BNB
    EchidnaLaunchFactory.sol        # tier-table totality, immutables, salt monotonicity, ownership
    EchidnaBundleRouter.sol         # access control + immutable constancy
    EchidnaLaunchVault.sol          # BNB conservation, vesting bounds, no over-claim, distribute one-shot
  AUDIT/echidna/
    README.md                       # this file
    REPORT.md                       # canonical results writeup
    results/                        # full per-contract logs (gitignored)
```

## How to run locally

Echidna runs in Docker (no host install needed):

```bash
cd packages/contracts-evm
docker run --rm -v $(pwd)/../..:/code -w /code/packages/contracts-evm \
  --user $(id -u):$(id -g) \
  trailofbits/echidna:latest \
  echidna test-echidna/EchidnaLaunchVault.sol \
  --contract EchidnaLaunchVault \
  --config echidna.yaml \
  --test-limit 50000
```

Repeat for the other three harnesses. The full sweep (`/tmp/run_echidna_50k.sh`
template at the PR description) runs all four in sequence; total wallclock is
typically 15-40 minutes on a 16-core VPS.

## Sandbox notes

- The repo uses bun workspaces; OpenZeppelin lives at `node_modules/@openzeppelin/contracts`
  via symlink to `../../../node_modules/.bun/...`. Mount the **repo root**, not just the
  package, when invoking the docker image so the symlink resolves.
- Foundry artifacts (`out-foundry/`, `cache/`, `crytic-export/`) are gitignored.
- Echidna writes corpus + reproducer files as root by default; pass `--user 1000:1000`
  to keep host ownership clean.
- Echidna 2.3.x has a `Set.elemAt: index out of range` crash on harnesses with only
  one callable function. Each property contract therefore exposes at least two
  fuzzable entry points.

## Property catalog

See `REPORT.md` for the canonical list of properties tested and outcomes.
