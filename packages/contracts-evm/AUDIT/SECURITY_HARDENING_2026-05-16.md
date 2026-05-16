# Security hardening pass - 2026-05-16

## Scope

Reviewed `packages/contracts-evm` with local-only tooling and parallel defensive agent review. No external scanner APIs or payload services were used. This pass also fetched latest refs, fast-forward merged PR #569 (`sol/echidna-fuzz-pass`), and reapplied the local hardening work on top.

Tools run or attempted: Hardhat, Foundry, Echidna, Medusa, Slither, Mythril, Scribble, Solidity SMTChecker, Semgrep, Halmos, Aderyn, Manticore, hevm, and Kontrol.

## Implemented fixes

1. `LaunchFactory` now binds CREATE2 execution salts to the creator with `effectiveSalt(creator, vanitySalt)`, preventing another creator from consuming the same raw vanity salt.
2. `LaunchFactory.createLaunch` requires `msg.sender == config.creator`.
3. `BundleRouter` stores a factory-approved launch parameter hash and rejects mutated execution calldata.
4. `LaunchVault.pullBnbForLaunch` now requires `CLOSED`, so the bundle bot cannot bypass the explicit close lifecycle.
5. `LaunchVault.claim` verifies the recipient balance delta equals the recorded claim amount, preventing silent fee-on-transfer under-delivery.
6. `LaunchVault.enableRefundBundleFailed` is grace-period gated, matching the permissionless launch-expired recovery path.
7. `BundleRouter` measures the vault's actual token balance delta after transfer and passes the received amount to `LaunchVault.distribute`.
8. `LaunchVault.distribute` verifies the vault actually holds the recorded presaler share.
9. `TreasuryLP.recordManagedToken` is now factory/registrar-only, preventing creator dust-token pre-registration.
10. `LaunchFactory` wires each `TreasuryLP` to its router registrar during launch creation.
11. `TreasuryLP4` rejects non-8-decimal BNB/USD feeds, validates Chainlink round freshness, requires full tier token spend, checks adapter-reported spend against token balance delta, and clears V4 allowance after deployment.
12. `VeWaifuStaking` uses received-balance accounting for fee-on-transfer stake/reward tokens and keeps reward funding pull-based.
13. `VeWaifuStaking.exit` clears reward accounting before external transfers, and `setRewardDistributor` rejects zero addresses and emits an event.
14. `deploy-wave-h.js` no longer executes deployment side effects when imported by tests.
15. Slither-facing interface cleanup moved vault/router/treasury callback surfaces into real interfaces and made the implementations inherit them.
16. `TreasuryLP4` TWAP math now multiplies before division where possible and consumes Chainlink `startedAt`.
17. Intentional Slither suppressions are now scoped and explicit for accepted architecture warnings only.
18. `LaunchFactory.createLaunch` rejects predicted token addresses that already have code, catching preconsumed Portal salts before users can fund a dead launch.
19. `BundleRouter` rejects nonzero `tipBnb`; builder tips are disabled until there is an explicit non-vault funding model.
20. `TreasuryLP4` now verifies the V4 manager actually receives the full tier token amount, rejects fee-on-transfer tier deployment, and computes market cap from live token supply.
21. `VeWaifuStaking` rejects zero-token deployment.

## Added tests

- Creator-scoped vanity salt regression.
- Creator-only launch creation.
- Pre-close bundle execution rejection.
- Bundle execution rejects mutated factory-approved params.
- Grace-period-gated bundle-failed refund.
- Fee-on-transfer token distribution and claim under-delivery rejection.
- Treasury managed-token registration authorization, zero-balance, and creator-poisoning cases.
- TreasuryLP4 feed-decimal and V4 spent-delta mismatch cases.
- TreasuryLP4 fee-on-transfer tier rejection and live-supply market-cap math.
- Fee-on-transfer staking and reward notification accounting.
- Zero-token staking deployment rejection.
- Preconsumed predicted-token address rejection at `createLaunch`.
- Nonzero `tipBnb` rejection.
- Portal salt preconsumption regression: vault stays `CLOSED`, router remains unexecuted, and refunds open after the grace period.
- Foundry invariant suite for `LaunchVault` BNB conservation, cap bounds, claim ceilings, and distribution state.
- Scribble annotations for `LaunchVault` deposit cap, launch snapshot cap, and distribution state.

## Verification

Commands run from `packages/contracts-evm` unless noted:

```bash
bun run lint && bun run test                 # repo root
bunx hardhat test
	forge build --sizes
	forge test -vv
echidna test-echidna/EchidnaLaunchVault.sol --contract EchidnaLaunchVault --config echidna.yaml
echidna test-echidna/EchidnaBundleRouter.sol --contract EchidnaBundleRouter --config echidna.yaml
echidna test-echidna/EchidnaLaunchFactory.sol --contract EchidnaLaunchFactory --config echidna.yaml
echidna test-echidna/EchidnaTreasuryLP.sol --contract EchidnaTreasuryLP --config echidna.yaml
medusa fuzz --config /tmp/medusa-*.json
slither . --filter-paths 'contracts/mocks|contracts/probe|test|test-echidna|node_modules' --json /tmp/waifu-slither-zero.json --hardhat-ignore-compile
solc ... --model-checker-engine chc --model-checker-targets assert ...
	myth analyze contracts/LaunchVault.sol ...
	myth analyze contracts/BundleRouter.sol ...
	myth analyze contracts/TreasuryLP4.sol ...
	scribble contracts/LaunchVault.sol --output-mode flat --output /tmp/LaunchVault.scribble.sol
	semgrep --config /tmp/waifu-solidity-semgrep.yml contracts
	halmos --forge-build-out out-foundry --contract LaunchVaultInvariantTest --function invariant_ ...
	aderyn . --output /tmp/waifu-aderyn-report.md
	```

Results:

- Repo lint/test: completed successfully. Frontend lint emitted pre-existing accessibility warnings; all configured test tasks passed.
- Hardhat EVM tests: 100 passing, 1 pending real-fork gate.
- Foundry build/sizes: successful; `LaunchFactory` size is 23,911 bytes, 665 bytes under EIP-170.
- Foundry invariant tests: 4 passing over `LaunchVaultInvariantTest`.
- Echidna: all four harnesses passed at the configured 5k test limit. Echidna's internal Slither helper failed, so standalone Slither was run separately.
- Medusa: all four harnesses passed after using absolute target paths, enabling coverage, and funding the LaunchVault harness.
- Slither: final run exited 0 with `0 result(s) found`. Accepted architectural warnings are source-scoped with explicit Slither suppressions after review.
- SMTChecker: exited 0 with unsupported-language-feature warnings from OZ/external-call-heavy production code; no assertion failures were reported.
- Mythril: `LaunchVault`, `BundleRouter`, and `TreasuryLP4` completed successfully with no issues. `BundleRouter` and `TreasuryLP4` used via-IR solc settings.
- Scribble: ran parser/instrumentation successfully; found 3 `LaunchVault` annotations.
- Semgrep: local high-signal Solidity profile completed with 0 findings. An exploratory low-level-call rule only matched reviewed checked `.call{value: ...}` sites and was not used as the gate.
- Halmos: `LaunchVaultInvariantTest` passed all 4 invariants at depth 2. Halmos emitted symbolic-storage-base warnings on handler actor indexing, but no invariant failures.
- Aderyn: installed 0.1.9 panicked with `StripPrefixError(())`. Attempting to install the latest from Cargo failed in `svm-rs-builds`, so no Aderyn report could be produced in this environment.
- Manticore: install blocked on Python 3.12 because `pysha3` fails to build (`pystrhex.h` missing).
- hevm/Kontrol: no Homebrew formula or cask was available in this environment.

## Remaining recommended work

- Preventing public-mempool Portal salt preconsumption is not fully solvable in Solidity without changing Flap Portal. The recommended mitigation is to hide the final Portal salt until bundle execution and submit reveal/execute only through a private builder/relay path with public fallback disabled. If the token address must be public during presale, keep the current recovery path and monitor for salt preconsumption.
- Run the gated BSC fork suite with a fresh, non-pruned BSC RPC block before deployment.
- Decide whether `TreasuryLP.sweep` should remain creator-custodial or be moved behind a timelock/multisig/approved LP-deployer path.
- Keep a deployment checklist pinning Flap Portal address, token implementation, init-code hash, enum ordinals, canonical PCS router/factory/WBNB, and the observed 20 BNB graduation behavior.
