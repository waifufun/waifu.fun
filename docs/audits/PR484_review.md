The router does not correctly consume BNB that was forwarded to it by the launch vault, and it permanently strands tokens bought during the curve-fill step. These issues break the intended launch flow and token distribution.

Full review comments:

- [P1] Use the vault-funded balance when executing — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/BundleRouter.sol:81-81
  When this router is used with `LaunchVault.launch()`, the vault has already sent the launch BNB to the router via `receive()`, so a normal `execute()` call using those funds has `msg.value == 0` and always hits `BnbMismatch`. If the owner instead sends `curveFillBnb + v2BuyBnb` again to satisfy this check, the original vault-funded BNB is left in the contract and swept to `owner` at the end rather than funding the launch.

- [P1] Don't strand curve-fill tokens in the router — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/BundleRouter.sol:85-85
  For tokens whose `buy()` transfers/mints the curve-fill purchase to `msg.sender`, this call leaves the purchased curve tokens owned by `BundleRouter`. The later V2 burn deliberately measures only the swap delta, and the contract has no ERC20 sweep/forwarding function, so these curve tokens cannot be moved to the vault/presalers or treasury in production.
