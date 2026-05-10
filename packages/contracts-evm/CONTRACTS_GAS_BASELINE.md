# Contracts Gas Baseline

Generated on 2026-05-10 with `hardhat run scripts/gas-snapshot.js`.

| Operation | Gas Used |
| --- | ---: |
| LaunchVault.deposit first depositor | 114628 |
| LaunchVault.deposit repeat depositor | 38245 |
| LaunchVault.withdraw partial | 67576 |
| LaunchVault.close | 49517 |
| LaunchVault.launch | 195102 |
| LaunchVault.claim no vesting | 89356 |

The regression guard in `test/gas-snapshot.test.js` uses broad budgets so normal compiler jitter does not fail CI, while still catching large accidental regressions.
