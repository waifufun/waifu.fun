# docs.waifu.fun

user-facing docs for waifu.fun, built with [mintlify](https://mintlify.com).

two audiences:

- **creators** launching a token on the platform
- **presalers** depositing BNB into a launch

## local dev

```bash
cd apps/docs
bunx mint dev
```

opens on `http://localhost:3000` by default.

## structure

- `introduction.mdx` plus `what-is-an-agent-launch.mdx` for top-level orientation
- `creators/` for token creators
- `presalers/` for depositors
- `reference/` for addresses, API, glossary
- `faq.mdx` for the catch-all

## voice rules

- TPOT lowercase, conversational but precise
- NO em-dashes anywhere
- brand caps: WAIFU FLAP BNB BSC PCS IPFS USDC
- lowercase: waifu.fun, the bundle, the vault

## deploy

mintlify auto-deploys from the repo when wired up via their github app. for
ad-hoc previews, `mint build` produces a static export under `.mintlify/`.
