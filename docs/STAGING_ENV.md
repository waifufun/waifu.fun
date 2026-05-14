# staging env

current state of the dev.waifu.fun stack as of 2026-05-14.

## summary

| domain | branch | api | network |
|---|---|---|---|
| `waifu.fun` | `main` | `api.waifu.fun` (prod) | BSC mainnet |
| `dev.waifu.fun` | `develop` | `api.waifu.fun` (prod) | BSC mainnet |

**dev.waifu.fun deploys the develop branch UI but points at PRODUCTION api + mainnet contracts.**

this is intentional for now. it lets shadow click-test wave H frontend changes against real data without us needing a separate Neon DB + Railway env. it does NOT give us an isolated staging stack.

## what works

- preview every wave H frontend change before merging to main
- exercise read paths against prod data (launches index, agent pages, charts)
- click through every UI surface in the staging walkthrough checklist

## what does NOT work (do NOT do on dev.waifu.fun)

- submit a deploy or refund tx (it'll go to prod contracts)
- create a launch (it'll insert into prod DB)
- claim tokens (it'll move real BNB)

if you need to test write flows, use BSC testnet contracts + a locally pointed frontend.

## DNS + routing

- `dev.waifu.fun` → CNAME → `develop.waifu-fun.pages.dev` (proxied via CF)
- `develop.waifu-fun.pages.dev` is the CF Pages alias for the develop branch
- every push to develop triggers `.github/workflows/deploy-frontend.yml` which builds + deploys
- shared GH repo vars inject prod API URL into every build (intentional limitation)

## graduating to a real staging stack

what we'd need:
1. **separate api**: deploy `apps/api` to a second Railway env, expose as `dev.api.waifu.fun`
2. **separate DB**: Neon branch or new postgres pointed at testnet contracts
3. **GH env vars**: populate the existing `Preview` or `staging` environment with `NEXT_PUBLIC_API_URL=https://dev.api.waifu.fun` + testnet chain ID
4. **workflow conditional**: deploy-frontend.yml uses `environment: ${{ github.ref == 'refs/heads/main' && 'Production' || 'staging' }}`
5. **testnet contracts**: deploy wave H to BSC testnet, document addresses
6. **separate indexer + bundle-bot**: each pointed at testnet RPC + dev DB

estimated effort: half a day. blocker is wallet BNB top-up for testnet deploys + figuring out who hosts the second Railway env.

## quick contract address override (no full staging)

if you just want to point the existing dev.waifu.fun at testnet for the contract reads only:

1. add GH repo variables: `NEXT_PUBLIC_NETWORK_DEV=testnet`, `NEXT_PUBLIC_FACTORY_ADDRESS_DEV=0x...`
2. update `deploy-frontend.yml` to conditionally inject these on develop branch
3. frontend code already handles the network switch via `NEXT_PUBLIC_NETWORK`

backend api is still shared in this mode, but the wagmi reads/writes target testnet.
