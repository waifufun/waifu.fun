# Flap adapter config

New `agent-treasury` launches use Flap VaultPortal and Flap's official Split Vault. Configure:

- `WAIFU_PLATFORM_FEE_WALLET`: required EVM address receiving the platform share of the tax stream.
- `WAIFU_PLATFORM_CUT_BPS`: optional platform share in bps. Defaults to `1000` (10%). Production validation allows `1000` to `5000`.

For `agent-treasury`, the adapter deploys a Split Vault with two recipients in the launch transaction:

- platform wallet: `platformCutBps`
- agent Safe treasury: `10000 - platformCutBps`

For `custom-vault`, the adapter intentionally keeps the legacy `Portal.newTokenV5` single-beneficiary path and does not deploy a Split Vault. Custom vault owners are responsible for their own splitting logic.
