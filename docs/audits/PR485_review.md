codex
The new factory deploys routers that no external actor can execute and strands the unallocated 30% token supply in the factory with no withdrawal path. These issues break the intended launch flow for deployed launches.

Full review comments:
- [P1] Give factory-created routers a callable owner — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/LaunchFactory.sol:116-121
  For every launch created here, `BundleRouter` records `msg.sender` as its immutable `owner`, and this constructor call is made by `LaunchFactory`, not by the launch creator. Since `BundleRouter` has no ownership transfer and `LaunchFactory` exposes no proxy method to call `execute`, neither the creator nor any EOA can execute the bundle after the vault closes; BNB forwarded by `LaunchVault.launch()` can only sit in the router's `receive()` balance.
- [P1] Add an egress for parked token allocations — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/LaunchFactory.sol:143-145
  Each `createLaunch` leaves the 200M V2 LP allocation plus 100M treasury allocation in the factory, but ERC20 balances owned by a contract can only be moved by that contract's code and `LaunchFactory` has no method to transfer them later. For all launches created before the deferred treasury/LP integration exists, this permanently strands 30% of the token supply in the factory rather than merely parking it for W33b.
