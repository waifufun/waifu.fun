# @waifufun/contracts-solana

IDL-backed Solana contract package for the currently committed WaifuFun programs.

This package is a thin compatibility shim over [`@waifufun/programs`](/Users/shawwalters/eliza-workspace/waifu.fun/packages/programs/package.json)
for the current and legacy `waifufun` programs. The canonical committed IDLs and
generated types live in `@waifufun/programs`; this package only preserves the
legacy import surface.

Current WaifuFun instruction surface:

- `accept_authority`
- `configure`
- `launch`
- `launch_and_swap`
- `nominate_authority`
- `set_max_amounts`
- `swap`
- `withdraw`

Canonical program addresses:

- mainnet `waifufun`: `autoiNVyGniA5dosggHy34BZYimthNzLy6WXL7qwzPA`
- devnet `waifufun`: `TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS`

Audited reference source code is vendored separately in [`../autofun-sc-audit`](/Users/shawwalters/eliza-workspace/waifu.fun/packages/contracts-solana/autofun-sc-audit).
