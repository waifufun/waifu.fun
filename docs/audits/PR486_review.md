The added fork integration test makes exact vesting assumptions despite Hardhat automining blocks between launch and claims, so the new test can fail under the intended BSC fork execution.

Status: fixed by the Wave H security hardening branch. Current fork/integration tests avoid strict vesting equality around auto-mined blocks.

Finding:

- [P2] Avoid exact vesting assertions after mined blocks - `packages/contracts-evm/test/integration/full-flow.test.js:331`
  When this fork test runs, several transactions are mined after `launch()` before Alice's first claim, and `LaunchVault` vests based on `block.timestamp - launchTimestamp`. That means the first claim is slightly more than exactly 50%, and the later `increaseTime(HALF_DAY)` check is slightly more than exactly 75%, so these exact balance/vesting equalities will fail or become timestamp-dependent on the BSC fork. Use a tolerance like the existing vesting unit tests or set the next block timestamp relative to `launchTimestamp` before claiming.
