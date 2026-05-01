# V3 frontend preview QA

This artifact covers the preview rollout checks for the launchpad picker and waitlist surfaces after the W1 to W3 merges.

## Local config and Vercel audit

Checked on 2026-04-30 from branch `sol/wave-launchpad/v3-preview-qa`.

Local findings:

- No committed `.vercel` project link is present in the worktree.
- No committed `apps/frontend/vercel.json` or root `vercel.json` is present.
- Root `.env.example` documents the existing frontend API and chain constants but does not yet include `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED`.
- `apps/frontend/next.config.ts` forwards these build-time public values: `NEXT_PUBLIC_DECIMALS`, `NEXT_PUBLIC_TOKEN_SUPPLY`, `NEXT_PUBLIC_VIRTUAL_RESERVES`, `NEXT_PUBLIC_HOST`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_PROJECT_ID`.
- The launchpad picker flag is read directly in client modules from `process.env.NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED === "true"`, so it must be present at build time for preview deployments that should show the picker step.

Vercel project findings from `vercel project inspect waifu.fun --scope sols-projects-6a5ae965`:

- Project: `waifu.fun`
- Owner: `Sol's projects`
- Root directory: `apps/frontend`
- Framework preset: Next.js
- Node.js version: `24.x`
- Install command: `cd ../.. && pnpm install --no-frozen-lockfile`
- Build command: Vercel default Next.js build, shown as `npm run build` or `next build`

Vercel env name audit, values not inspected or recorded:

Preview currently has:

- `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE`
- `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE_FAST`
- `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE`
- `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE_FAST`
- `NEXT_PUBLIC_HELIUS_API_KEY`
- `NEXT_PUBLIC_DECIMALS`
- `NEXT_PUBLIC_TOKEN_SUPPLY`
- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_HOST`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_STEWARD_TENANT_ID`
- `NEXT_PUBLIC_STEWARD_API_URL`

Production currently has:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_STEWARD_TENANT_ID`
- `NEXT_PUBLIC_STEWARD_API_URL`
- `CODEX_API_KEY`
- `NEXT_PUBLIC_HELIUS_API_KEY`
- `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE_FAST`
- `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE`
- `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE_FAST`
- `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE`
- `NEXT_PUBLIC_TOKEN_SUPPLY`
- `NEXT_PUBLIC_DECIMALS`
- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_HOST`

`NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED` was not present in the preview or production env name lists during this audit.

## Required frontend env vars

Required for v3 preview launchpad QA:

- `NEXT_PUBLIC_API_URL`: points the frontend to the waifu API. Preview should point at the backend preview or staging API that exposes `/v3/launchpads` and `/v3/launchpads/:id/waitlist`.
- `NEXT_PUBLIC_HOST`: public frontend origin used by metadata and share links.
- `NEXT_PUBLIC_NETWORK`: expected chain mode for banners and constants. Existing preview value should be confirmed before public testing.
- `NEXT_PUBLIC_TOKEN_SUPPLY`: token math constant used by existing frontend flows.
- `NEXT_PUBLIC_DECIMALS`: token decimal constant used by existing frontend flows.
- `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE`, `NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE_FAST`, `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE`, `NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE_FAST`: required by token media generation controls.
- `NEXT_PUBLIC_STEWARD_TENANT_ID` and `NEXT_PUBLIC_STEWARD_API_URL`: required for Steward login surfaces.
- `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED`: v3 preview feature flag. Use `true` only for targeted preview builds. Leave unset or set to `false` for legacy regression builds.

Optional or contextual:

- `NEXT_PUBLIC_HELIUS_API_KEY`: used by Solana related features when enabled.
- `NEXT_PUBLIC_PROJECT_ID` or `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: wallet integration values if wallet connection QA is in scope.
- `NEXT_PUBLIC_BSC_RPC_URL` or `NEXT_PUBLIC_EVM_RPC_URL`: EVM provider override if default BSC RPC is not acceptable.
- `NEXT_PUBLIC_GOOGLE_TAG_ID`: analytics only.

## Preview flag strategy

Use two preview deployments before any production consideration.

1. Flag off preview
   - `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED` unset or `false`.
   - Goal: prove legacy create flow still omits the launchpad step and sends the legacy provision payload.
2. Flag on preview
   - Branch-scoped preview env `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED=true`.
   - Goal: prove launchpad selection enters the create flow, live launchpads can reach review, coming-soon launchpads open waitlist UI, and provision payloads include the expected `launchpad` block.

Do not set production env during this QA pass.

Recommended branch-scoped preview command:

```bash
vercel link --yes --project waifu.fun --scope sols-projects-6a5ae965
printf "true" | vercel env add NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED preview sol/wave-launchpad/v3-preview-qa --scope sols-projects-6a5ae965 --force
vercel --scope sols-projects-6a5ae965 --target preview
rm -rf .vercel .env.local
```

If a flag-off preview build is needed on the same branch, run:

```bash
vercel link --yes --project waifu.fun --scope sols-projects-6a5ae965
printf "false" | vercel env add NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED preview sol/wave-launchpad/v3-preview-qa --scope sols-projects-6a5ae965 --force
vercel --scope sols-projects-6a5ae965 --target preview
rm -rf .vercel .env.local
```

Use `printf`, not `echo`, so Vercel does not store a trailing newline in the env value.

## Automated local QA

Run the helper from the repo root:

```bash
./scripts/v3-frontend-qa.sh
```

Equivalent manual commands:

```bash
pnpm --filter @waifufun/frontend test
pnpm --filter @waifufun/frontend exec tsc --noEmit
pnpm lint
```

The frontend test suite currently covers:

- Launchpad payload omission when the picker flag is off.
- Launchpad payload inclusion with `launchpad_id`, `chain`, `launchpad_config`, `fee_mode`, and `fees_can_be_disabled` when the picker flag is on.
- Chain fallback for drafts saved before `selectedChain` existed.
- Waitlist success, duplicate, validation, rate limit, missing route, network, email normalization, and local invalid email handling.

## Flag-off legacy regression checklist

- Visit `/create` with flag off.
- Confirm step sequence is `persona`, `runtime`, `safe & policies`, `review`. The launchpad step must not render.
- Fill persona values with leading and trailing spaces, then review. Confirm name and ticker render trimmed where payload expectations matter.
- Confirm runtime choices still work for hosted, webhook, and pull modes.
- Confirm safe adapter toggles still work and do not require launchpad selection.
- Submit with backend provision unavailable. Expected UI: friendly saved configuration state, not a hard crash.
- Confirm `buildProvisionPayload` omits `launchpad` even if an old localStorage draft contains launchpad data.
- Clear `localStorage["waifu-wizard-draft"]` after testing.

## Flag-on wizard checklist

- Visit `/create` with `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED=true` at build time.
- Confirm step sequence is `persona`, `launchpad`, `runtime`, `safe & policies`, `review`.
- Confirm initial launchpad list renders loading and fallback-safe content if `/v3/launchpads` is unavailable.
- Select each live launchpad:
  - `four-meme-regular`
  - `four-meme-tax`
  - `flap`
- Confirm selected launchpad state persists after navigating forward and back.
- Confirm review shows selected launchpad information.
- Submit a live launchpad flow against a backend that supports provision. Expected payload includes the `launchpad` block described below.
- Submit against a backend without provision. Expected UI: saved configuration state with no crash.
- Confirm coming-soon cards do not select a launchpad or advance the wizard by accident.

## Mobile QA checklist

Test at 375 px, 390 px, 430 px, 768 px, and one desktop width.

- No horizontal scroll on `/create` or launchpad modal.
- Step navigation remains readable and tappable.
- Touch targets are at least 44 px high for primary actions, close buttons, and card buttons.
- Button active states feel tactile, with visual press feedback.
- Dialog can be closed from touch devices and focus returns to a sensible place.
- Long launchpad notes and error messages wrap without clipping.
- Inputs remain visible when mobile keyboard is open.
- Full-height sections must use mobile-safe dynamic viewport behavior, not brittle `h-screen` assumptions.

## Waitlist states checklist

For coming-soon launchpads, test `pump-fun`, `bags`, and `custom`.

- Empty input: local validation message, no network request.
- Invalid email: local validation message, no network request.
- Successful signup, 2xx: success state with normalized email.
- Duplicate signup, 409 or body code `already_joined` or `duplicate`: already joined state, not an error.
- Backend validation, 400 or 422: clear inline error below the input.
- Missing backend route, 404: `waitlist is not available for this launchpad yet.`
- Rate limit, 429: `too many attempts. wait a minute and try again.`
- Server failure, 5xx: `waitlist service is having trouble. try again soon.`
- Network failure: `could not reach the waitlist service. try again when your connection is stable.`
- While submitting: primary button disabled with `reserving spot` copy.

## Payload contract expectation

Flag off or no launchpad selection:

```json
{
  "persona": {
    "name": "Mika",
    "ticker": "MIKA",
    "bio": "A market-native waifu.",
    "personaPrompt": "trade carefully",
    "avatarTemplateId": "tessera",
    "hasAvatarUpload": false
  },
  "runtime": {
    "kind": "hosted"
  },
  "safe": {
    "taxAgentBps": 8000,
    "taxPatronBps": 2000,
    "adapters": [
      { "slug": "pancake", "enabled": true },
      { "slug": "venus", "enabled": true }
    ]
  }
}
```

Flag on with a selected live launchpad:

```json
{
  "persona": {
    "name": "Mika",
    "ticker": "MIKA",
    "bio": "A market-native waifu.",
    "personaPrompt": "trade carefully",
    "avatarTemplateId": "tessera",
    "hasAvatarUpload": false
  },
  "runtime": {
    "kind": "hosted"
  },
  "safe": {
    "taxAgentBps": 8000,
    "taxPatronBps": 2000,
    "adapters": [
      { "slug": "pancake", "enabled": true },
      { "slug": "venus", "enabled": true }
    ]
  },
  "launchpad": {
    "launchpad_id": "four-meme-tax",
    "chain": "bsc",
    "launchpad_config": {
      "tokenBuyBps": 4000,
      "tokenPairBps": 3000,
      "creatorClaimBps": 1000,
      "waifuClaimBps": 1000,
      "rewardsBps": 1000,
      "tradingFeeBps": 100,
      "creatorFeeShareBps": 5000,
      "protocolFeeShareBps": 5000
    },
    "fee_mode": "production",
    "fees_can_be_disabled": false
  }
}
```

Backend should tolerate only known launchpad ids, known chain ids, and production fee configs for public preview. If backend readiness is not complete, the frontend should keep using friendly not-wired states rather than masking errors as success.

## Blockers and notes

- Preview cannot exercise the flag-on wizard until `NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED=true` is added for the target preview build or branch.
- The frontend preview should point `NEXT_PUBLIC_API_URL` at the W4 backend preview when W4.A publishes it. Until then, `/v3/launchpads` should fall back to local descriptors and waitlist calls may return missing route or network states.
- Do not mutate production Vercel env for this rollout without a separate approval and report.
