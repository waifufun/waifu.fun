The new factory deploys routers that no external actor can execute and strands the unallocated 30% token supply in the factory with no withdrawal path. These issues break the intended launch flow for deployed launches.

Status: fixed by the Wave H security hardening branch. The current factory deploys a bundle-bot-gated router, wires vault/router explicitly, and no longer parks the 30% allocation in the factory.

Findings:
- [P1] Give factory-created routers a callable owner - `packages/contracts-evm/contracts/LaunchFactory.sol:116`
  For every launch created here, `BundleRouter` records `msg.sender` as its immutable `owner`, and this constructor call is made by `LaunchFactory`, not by the launch creator. Since `BundleRouter` has no ownership transfer and `LaunchFactory` exposes no proxy method to call `execute`, neither the creator nor any EOA can execute the bundle after the vault closes; BNB forwarded by `LaunchVault.launch()` can only sit in the router's `receive()` balance.
- [P1] Add an egress for parked token allocations - `packages/contracts-evm/contracts/LaunchFactory.sol:143`
  Each `createLaunch` leaves the 200M V2 LP allocation plus 100M treasury allocation in the factory, but ERC20 balances owned by a contract can only be moved by that contract's code and `LaunchFactory` has no method to transfer them later. For all launches created before the deferred treasury/LP integration exists, this permanently strands 30% of the token supply in the factory rather than merely parking it for W33b.
