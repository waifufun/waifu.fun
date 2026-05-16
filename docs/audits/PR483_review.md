The vault can enter LAUNCHED without executing the router’s launch logic, and it does not enforce important sale boundaries such as the deadline and cap. These are functional issues affecting launch correctness and allocation accounting.

Status: fixed by the Wave H security hardening branch. The current vault enforces close/cap boundaries, transitions through a router pull, and only records distribution after the router transfers the presaler share.

Findings:

- [P1] Call the router entrypoint instead of plain value transfer - `packages/contracts-evm/contracts/LaunchVault.sol:213`
  When this vault is wired to the launch router used elsewhere in the launch flow, sending raw BNB only hits `receive()` and does not execute the bundle/launch logic. In that scenario `launch()` still marks the vault as `LAUNCHED` and allows token claims while the BNB just sits on the router, so the actual market launch never happens.

- [P2] Enforce the close timestamp on deposits - `packages/contracts-evm/contracts/LaunchVault.sol:142`
  If no one has called `close()` yet, deposits remain accepted even after `closeTimestamp` has passed. Any late depositor can enter after the advertised deadline and dilute allocations for users who deposited during the intended window, until a keeper/owner transaction closes the vault.

- [P2] Enforce the presale cap when accepting deposits - `packages/contracts-evm/contracts/LaunchVault.sol:150`
  Factory-created launches expose tier presale caps, but the vault accepts unbounded deposits. In an oversubscribed round this lets `totalDeposited` exceed the configured cap, changes all pro-rata allocations, and forwards more BNB to the launch path than the tier economics expect.
