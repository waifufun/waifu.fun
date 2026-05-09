The vault can enter LAUNCHED without executing the router’s launch logic, and it does not enforce important sale boundaries such as the deadline and cap. These are functional issues affecting launch correctness and allocation accounting.

Full review comments:

- [P1] Call the router entrypoint instead of plain value transfer — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/LaunchVault.sol:213-213
  When this vault is wired to the launch router used elsewhere in the launch flow, sending raw BNB only hits `receive()` and does not execute the bundle/launch logic. In that scenario `launch()` still marks the vault as `LAUNCHED` and allows token claims while the BNB just sits on the router, so the actual market launch never happens.

- [P2] Enforce the close timestamp on deposits — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/LaunchVault.sol:142-142
  If no one has called `close()` yet, deposits remain accepted even after `closeTimestamp` has passed. Any late depositor can enter after the advertised deadline and dilute allocations for users who deposited during the intended window, until a keeper/owner transaction closes the vault.

- [P2] Enforce the presale cap when accepting deposits — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/LaunchVault.sol:150-151
  Factory-created launches expose tier presale caps, but the vault accepts unbounded deposits. In an oversubscribed round this lets `totalDeposited` exceed the configured cap, changes all pro-rata allocations, and forwards more BNB to the launch path than the tier economics expect.
