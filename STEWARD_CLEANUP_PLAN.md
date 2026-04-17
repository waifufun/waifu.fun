# Steward Auth Cleanup Plan — waifu.fun

> **Research date:** 2026-04-16
> **TL;DR:** waifu.fun **already has** Steward integrated in the frontend, and `waifu-core` (the Hono backend at `api.waifu.fun`) already has a Steward JWT verification middleware + a creator-resolution service. SDK versions are roughly current (`@stwd/sdk@0.7.2`, `@stwd/react@0.6.4`). The integration is healthier than Babylon's was — but there are three concrete issues: a **tenantId mismatch in waifu-core** (`waifu` vs `waifu-fun`), **no explicit token auto-refresh loop** in the provider, and **two parallel auth systems** (Steward JWT in waifu-core vs wallet cookie-JWT in the legacy Fastify `apps/backend`) whose status (deprecated? still live?) needs Shadow's call.

---

## Current state

### Monorepo layout (three sibling repos)

- **`/home/shad0w/projects/waifu.fun`** — frontend web + legacy Fastify backend.
  - `apps/frontend` — **Next.js 15.3.9 App Router** (Turbopack dev). Has Steward integration.
  - `apps/backend` — legacy Fastify (port 3001), wallet SIWE + httpOnly cookie JWT, `@fastify/jwt`. No Steward code.
  - `apps/indexer` — on-chain indexer.
  - Package manager: **pnpm** workspaces + Turbo.
- **`/home/shad0w/projects/waifu-core`** — new Hono backend (deployed at `api.waifu.fun`, port 3100). **This is where Steward auth lives on the server.**
  - `apps/api` — Hono server. Has `middleware/steward-auth.ts` (JWT verify via `jose`) + `middleware/auth.ts` (steward / SIWE / dev bearer). Creator auto-provisioning in `services/user-resolution.ts`.
  - `apps/worker`, `apps/indexer` — side jobs.
  - Package manager: **pnpm** workspaces + Turbo (separate from waifu.fun).
  - DB: **Drizzle + Postgres**. `creators` table has `steward_user_id` unique column (migration `0001_add_steward_user_id`). `agent_wallets` table has `steward_tenant_id` + `steward_agent_id`.
- **`/home/shad0w/projects/waifu-infra`** — nginx + docker-compose deploy configs, cloudflare tunnel. Does not touch Steward.

The frontend (`waifu.fun/apps/frontend`) points to `waifu-core` in prod via `NEXT_PUBLIC_API_URL=https://api.waifu.fun`. The old Fastify `apps/backend` may be **dead code or only serving a subset of routes** — needs Shadow confirmation (see open questions).

### Steward frontend integration

**Packages installed** (`apps/frontend/package.json`):
- `@stwd/sdk@0.7.2` ✅ current (latest published 0.7.2)
- `@stwd/react@0.6.4` — minor drift from latest (0.6.5)
- `@simplewebauthn/browser@13.3.0` — for passkey ceremonies
- **No `@privy-io/*`** anywhere. Privy was never integrated, so there's no migration debt here (unlike Babylon).

**Provider** (`apps/frontend/src/providers/steward-provider.tsx`):
- Uses `@stwd/react`'s `StewardProvider` (not the raw SDK like Babylon). This is the "blessed" pattern, matches eliza-cloud.
- Instantiates `StewardClient` with `baseUrl = NEXT_PUBLIC_STEWARD_API_URL ?? "https://eliza.steward.fi"`, `tenantId = NEXT_PUBLIC_STEWARD_TENANT_ID ?? "waifu"`.
- Auth sub-config: `auth={{ baseUrl: STEWARD_API_URL }}`, `agentId = "waifu-web"` (dummy, fine).
- Features flags: locks down wallet/spend/policy UI — auth-only usage.
- Theme: `#00ff87` brand green, dark scheme, hardcoded hex values (not design tokens).

**Providers mount order** (`apps/frontend/src/app/providers.tsx`):
```
Suspense → LocaleProvider → TooltipProvider → ProgressProvider →
  EvmProvider (dynamic, ssr:false) →
    WaifuStewardProvider (dynamic, ssr:false) →
      ApiAuthSync → AnimationProvider → TransactionListenerProvider
```
Steward is inside EVM so SIWE inside the Steward modal can see wagmi's wallet. Clean.

**JWT → API header bridge** (`apps/frontend/src/components/steward/api-auth-sync.tsx` + `src/hooks/use-api-auth.ts` + `src/lib/api-auth.ts`):
- `useApiAuth()` reads `{ getToken, isAuthenticated }` from `@stwd/react`'s `useAuth` and stores `getToken` in a module-level getter.
- `fetcher` in `src/lib/api.ts` calls `getApiToken()` on every request and adds `Authorization: Bearer <jwt>` when present.
- Fallback path: `credentials: "include"` cookies (the old wallet-cookie auth) is still sent, so a user can be authed by *either* path.

**Auth UI** (`apps/frontend/src/components/`):
- `header-auth.tsx` — unified sign-in button. Modal-based. Surfaces:
  - Not authed → single "Sign In" button → `StewardLoginWidget` modal.
  - Steward-authed only → user menu + "Connect Wallet" button.
  - Wallet-only → wallet pill + "Sign In" button (to also get Steward).
  - Both → user menu + wallet pill.
- `steward/steward-login-widget.tsx` — modal wrapping `<StewardLogin>` with `showEmail showGoogle showDiscord showPasskey` + a `ConnectButton.Custom` RainbowKit wallet option below a divider.
- `steward/steward-user-menu.tsx` — thin wrapper around `<StewardUserButton>` (hides when not authed).

**Callback routes** (`apps/frontend/src/app/auth/`):
- `callback/page.tsx` — `<StewardEmailCallback>` (magic link).
- `oauth/callback/page.tsx` — `<StewardOAuthCallback>` for Google/Discord (provider from query param).

Both use the shipped components from `@stwd/react`. No custom bridging.

### Steward backend integration (`waifu-core/apps/api`)

- `src/middleware/steward-auth.ts` — verifies HS256 JWT with `jose.jwtVerify`, issuer `steward`, requires `payload.tenantId === STEWARD_TENANT_ID` (defaults to `"waifu"`). Returns `{ userId, tenantId, email?, address? }`.
- `src/middleware/auth.ts` — unified bearer parser. Tries Steward first, then SIWE JWT, then dev token. Maps Steward principal to `AuthPrincipal` with `authSource: "steward"` and `stewardUserId`.
- `src/services/user-resolution.ts` — `resolveCreatorFromSteward(db, principal)`:
  1. Fast path: lookup `creators` by `steward_user_id`.
  2. Fallback: lookup by `evm_address` and backfill `steward_user_id`.
  3. Else: create a new `creators` row with the steward user id + (optional) address.
- `src/routes/agents.ts` — uses `principalToUserId(auth)` that returns `"waifu:steward-${stewardUserId}"` for Steward-authed users (stable across wallet changes) vs `"waifu:${address}"` for legacy SIWE users. Good pattern.
- `src/compat/config.ts` — reads env: `STEWARD_JWT_SECRET`, `STEWARD_API_URL=https://eliza.steward.fi`, **`STEWARD_TENANT_ID` default `"waifu"`**, `STEWARD_TENANT_API_KEY`.

### The tenantId bug

Two different tenant strings live in waifu-core:
- `"waifu"` — used by `middleware/steward-auth.ts`, `compat/config.ts`, and the db column comment.
- `"waifu-fun"` — used by `routes/v2/agents.ts:86`, `services/agent-launch/orchestrator.ts:80`, `services/agent-launch/types.ts:46`, `scripts/test-agent-launch.ts`, and the `agent-wallets.ts` schema comment (`// Steward tenant id, e.g. "waifu-fun"`).

If the live Steward tenant is `waifu` (frontend uses it; auth middleware expects it), then the **agent provisioning pipeline is pointing at a tenant that probably doesn't exist on `eliza.steward.fi`**. This would cause agent launches to fail or (worse) create resources in the wrong tenant if `waifu-fun` exists for some unrelated reason.

### Env vars currently set

Checked:
- `apps/frontend/.env.production.local` has **no** `NEXT_PUBLIC_STEWARD_*` overrides — so production uses the hardcoded defaults: `https://eliza.steward.fi` + `waifu`. That's fine.
- `.env.example` doesn't document Steward vars — minor doc gap.
- No `.env` for `apps/backend` or `waifu-core` checked in here (normal).

### Live check (2026-04-16)

- `https://api.waifu.fun/health` → `200 OK`, `service: "waifu-api"`, `compatibilityMode: "real-db"`, `db.ok: true`. waifu-core is live.
- `https://api.waifu.fun/` lists `routeGroups: [health, auth, tokens, launches, creators, trades, agents, jobs, admin]`.
- `http://89.167.63.246/health` (direct Hetzner IP) also serves waifu-core.

### Relevant file paths

```
waifu.fun/apps/frontend/
├── package.json                                       # @stwd/sdk 0.7.2, @stwd/react 0.6.4
├── src/
│   ├── providers/steward-provider.tsx                 # WaifuStewardProvider wraps @stwd/react
│   ├── app/providers.tsx                              # mount order
│   ├── app/auth/callback/page.tsx                     # StewardEmailCallback
│   ├── app/auth/oauth/callback/page.tsx               # StewardOAuthCallback
│   ├── components/
│   │   ├── header-auth.tsx                            # unified sign-in UX
│   │   └── steward/
│   │       ├── api-auth-sync.tsx                      # mounts useApiAuth
│   │       ├── steward-login-widget.tsx               # modal
│   │       ├── steward-user-menu.tsx                  # thin StewardUserButton wrapper
│   │       └── index.ts
│   ├── hooks/use-api-auth.ts                          # wires getToken into api-auth store
│   └── lib/
│       ├── api.ts                                     # fetcher reads token, sets Authorization
│       └── api-auth.ts                                # module-level token getter
└── apps/backend/                                      # legacy Fastify, wallet-cookie JWT, NO Steward

waifu-core/apps/api/src/
├── middleware/
│   ├── steward-auth.ts                                # verify HS256 JWT, check tenantId=="waifu"
│   └── auth.ts                                        # parseBearerToken: steward → SIWE → dev
├── services/
│   ├── user-resolution.ts                             # resolveCreatorFromSteward
│   └── agent-launch/                                  # uses tenantId "waifu-fun" ⚠️
├── routes/
│   ├── auth.ts                                        # SIWE nonce + /auth/me
│   └── agents.ts                                      # principalToUserId(auth)
└── compat/config.ts                                   # STEWARD_TENANT_ID default "waifu"
```

---

## Known issues

### Compared with Babylon's three core issues

| # | Question                                            | waifu.fun                                                                                                                                                                                                                                                      | babylon                                                                 | eliza-cloud                                                              |
|---|-----------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1 | **Auto-refresh** in the provider?                   | ❌ No explicit wall-clock timer. Relies on `@stwd/sdk@0.7.2`'s opportunistic refresh inside `getToken()` (fires `refreshSession()` non-blocking when `isNearExpiry()`). So: refresh only happens when code calls `getToken()`; an idle tab may silently expire. | ❌ No timer either. Uses SDK directly, less clear on opportunistic path. | ✅ Explicit 60s `setInterval`, refresh when `<120s` remain.              |
| 2 | **Ghost users** (JWTs issued without Steward-side `ensureUser`)? | ⚠️ Partial — but smaller surface than babylon. No custom identity bridges (no farcaster/telegram/miniapp JWT issuers). All Steward JWTs come from Steward itself. However, there is **no `ensureStewardUserMapping`-equivalent on the server** — new users only land in the local `creators` table via `resolveCreatorFromSteward`, not pushed back to Steward's platform user table. | Broken: farcaster + telegram/miniapp routes self-issue Steward-shaped JWTs without provisioning. | ✅ `ensureStewardUserMappingForUser` provisions via `/platform/users`. |
| 3 | **Mobile / Capacitor**?                              | ❌ N/A — waifu.fun has no mobile app. Web only. No Capacitor config, no native shell. Nothing to fix here.                                                                                                                                                    | ⚠️ Mobile still on Privy — broken.                                      | ❌ Web only.                                                             |

### Waifu-specific issues

1. **TenantId inconsistency in waifu-core** (🔴 **highest-risk single bug**):
   - Steward JWT verification expects `tenantId === "waifu"`.
   - Agent launch pipeline (`services/agent-launch/orchestrator.ts`, `routes/v2/agents.ts`) defaults to `"waifu-fun"`.
   - In prod this likely means either (a) agent launches are pointed at a tenant that doesn't exist (depends on what `STEWARD_TENANT_ID` is set to in prod env) or (b) env is set to `waifu` and the `"waifu-fun"` defaults are dead fallbacks. Either way, the codebase is telling two different stories and needs to be unified.

2. **Dual-backend auth** (unclear):
   - `waifu.fun/apps/backend` (Fastify, port 3001) still contains a full wallet auth flow: `POST /generateNonce`, `POST /authenticate`, `GET /status`, `POST /logout`, `GET /getWallets`. Sets `evm` and `solana` httpOnly cookies.
   - The frontend's `lib/api.ts` still exports `authenticate()`, `generateNonce()`, `getAuthStatus()`, `logOut()` that look like they'd call these endpoints. But `NEXT_PUBLIC_API_URL=https://api.waifu.fun` which is **waifu-core** (Hono).
   - waifu-core's `/auth` routes use SIWE + Steward, not the old nonce flow. So calling frontend-helper `generateNonce()` hits waifu-core's `GET /auth/nonce` (returns a nonce) but then `authenticate()` calls `POST /auth/verify` — **waifu-core doesn't have `/auth/verify`**, it has `/auth/siwe`. So one of two things: (a) wallet SIWE login from waifu.fun is currently broken in prod, or (b) there's a proxy/rewrite I haven't spotted that fixes this, or (c) wallet login is genuinely deprecated and nobody uses it.
   - `apps/frontend/src/components/header-auth.tsx` references `logOut("evm")` from `@/lib/api` on disconnect — calls the dead Fastify shape.
   - **Needs Shadow clarification: is `apps/backend` dead code? Is wallet-SIWE login actually working in prod?**

3. **No auto-refresh timer**:
   - `@stwd/sdk@0.7.2` has opportunistic refresh in `getToken()` (see `/home/shad0w/projects/steward-fi/packages/sdk/src/auth.ts:215-225`), but NOT a wall-clock timer. An idle tab past expiry will fail the next request with 401, then recover only if the refresh token is still valid and a new `getToken()` call triggers.
   - eliza-cloud's `StewardProvider.tsx` adds a proactive `setInterval` (60s poll, refresh when <120s remain). waifu.fun does not.
   - **Impact:** users on an idle tab could silently log out. Not catastrophic (refresh token lives 30 days, next interaction refreshes) but inconsistent with eliza-cloud.

4. **`@stwd/react` version drift**: 0.6.4 installed, 0.6.5 available. Minor, likely bug fixes.

5. **Creator backfill edge case**:
   - `resolveCreatorFromSteward` links by `evmAddress` if present in the steward JWT. Email-only Steward users have no `address` claim.
   - If a user first authenticates with wallet (SIWE creates a `creators` row with `evmAddress`), then later signs in with email-only Steward, a new `creators` row is created with `stewardUserId` and `evmAddress = null`. The two profiles are never merged. Potential duplicate-user-per-human.
   - Real-world severity probably low today (email login is new) but will grow.

6. **No server-side provisioning of Steward users**:
   - waifu has no equivalent of eliza-cloud's `ensureStewardUserMappingForUser` — it never calls Steward's `/platform/users` admin API to provision/upsert a user. Steward provisions its own users on login, so this is fine unless waifu wants to create Steward users from the waifu side (e.g., for imported wallets getting a Steward identity proactively). Flag: no `STEWARD_PLATFORM_KEYS` env var used.

7. **Theme hardcoded**:
   - `steward-provider.tsx` uses raw hex strings (`#00ff87`, `#08080a`, ...). Not pulling from the design tokens in `DESIGN_SYSTEM.md`. Low-priority hygiene.

8. **Env documentation**:
   - `.env.example` has no `NEXT_PUBLIC_STEWARD_*` or `STEWARD_*` entries. New contributors have to read the code to know how to configure.

9. **Old Fastify `apps/backend` still has Privy-less cookie JWT code**: dead weight if Fastify backend is deprecated. Lots of `ensureUserExists` writes into Mongoose `User` collection — a second, parallel identity store (Mongo User) from waifu-core's Postgres `creators`.

---

## Implementation plan

### Phase 1: Critical fixes (matches babylon's Phase 1) — **S**

**1a. Fix tenantId inconsistency in waifu-core.** 🔴 **(highest priority)**
   - Decide canonical tenant string. Almost certainly `"waifu"` (that's what the frontend sends and what steward-auth middleware expects).
   - Replace `"waifu-fun"` in:
     - `apps/api/src/routes/v2/agents.ts:86`
     - `apps/api/src/services/agent-launch/orchestrator.ts:80`
     - `apps/api/src/services/agent-launch/types.ts:46` (comment)
     - `apps/api/src/compat/config.ts` (already correct — `"waifu"` default)
     - `packages/db/src/schema/agent-wallets.ts:27` (comment)
     - `scripts/test-agent-launch.ts` (comments + fallback)
   - Verify the Steward tenant is actually named `waifu` on `eliza.steward.fi` (Shadow confirmation or `curl` with a tenant admin key).
   - Set `STEWARD_TENANT_ID=waifu` explicitly in prod env for waifu-core (Hetzner VPS + `docker-compose.prod.yml`).

**1b. Add auto-refresh timer to `WaifuStewardProvider`** (mirrors eliza-cloud).
   - Add an inner `<RefreshLoop>` component that:
     - Reads session + `stewardAuth` from `useAuth` / the SDK.
     - `setInterval(60_000)` — calls `isNearExpiry()`, calls `refreshSession()` when `<120s` remain.
     - Cleans up on unmount.
   - ~40 lines. Use eliza-cloud's `AuthTokenSync` as reference (without the cookie sync part, since waifu uses localStorage + module-level getter not httpOnly cookies).
   - Alternative: confirm SDK 0.7's opportunistic refresh in `getToken()` is "good enough" given waifu's usage pattern, and **document** that decision in a comment. (Probably yes for most waifu users; the SPA calls `fetcher` often via react-query, which re-reads `getToken()`.)

**1c. Clarify Fastify `apps/backend` status.**
   - Audit which frontend code paths actually hit the Fastify backend vs waifu-core. Grep for call sites of `authenticate`, `generateNonce`, `getAuthStatus`, `logOut`, chat routes, generation routes.
   - If `apps/backend` is dead: delete it (or move to `archive/`), remove the helpers from `lib/api.ts`, and remove the second auth path from `header-auth.tsx`.
   - If live: document which routes live there and why (MongoDB vs Postgres split).
   - **This is the big open question — Shadow's call.**

**Effort:** 1a = 1-2h. 1b = 2-3h. 1c = unknown (1h audit + M-L cleanup if we kill Fastify, or S to just document).

### Phase 2: Hygiene — **S-M**

**2a. Bump `@stwd/react` 0.6.4 → 0.6.5.** Minor, safe.

**2b. Add Steward env vars to `.env.example`.**
```
NEXT_PUBLIC_STEWARD_API_URL=https://eliza.steward.fi
NEXT_PUBLIC_STEWARD_TENANT_ID=waifu
# For waifu-core (server):
STEWARD_JWT_SECRET=...
STEWARD_API_URL=https://eliza.steward.fi
STEWARD_TENANT_ID=waifu
STEWARD_TENANT_API_KEY=...
STEWARD_API_KEY=...   # used by agent-launch pipeline (different from tenantApiKey)
```

**2c. Design token alignment** — replace hardcoded hex in `steward-provider.tsx` theme with the tokens from `DESIGN_SYSTEM.md`. Cosmetic.

**2d. Improve creator-to-steward linkage (the dual-profile edge case).**
   - Add a "link wallet to steward account" flow after signing in. Or:
   - When an email-authed Steward user connects a wallet via RainbowKit, call a new `POST /creators/me/link-wallet` on waifu-core that merges the profile rows.
   - Lower priority until someone actually complains.

### Phase 3: Polish — **S**

**3a. `ensureStewardUser()`-style provisioning** (parity with eliza-cloud) — only if waifu-core ever needs to create Steward users proactively (e.g., for imported wallets). Not needed today; waifu only reads JWTs, never issues them.

**3b. Rename the `WaifuStewardProvider` `agentId: "waifu-web"` dummy** — maybe use a `waifu.fun` constant. Trivial.

**3c. Sunset the dev-only `/auth/dev-setup` route** if Fastify backend stays alive — currently exposes seeded cookies in dev that shouldn't leak to staging.

---

## Open questions (flagged for Shadow)

1. **🔴 Is Fastify `apps/backend` dead code or still serving prod routes?** Frontend has helper functions (`authenticate`, `generateNonce`, `logOut`) that seem to assume the old Fastify shape, but `NEXT_PUBLIC_API_URL` points to waifu-core (Hono). If dead: delete + simplify. If live: document + fix shape mismatch.
2. **Tenant ID confirmation:** is the Steward tenant on `eliza.steward.fi` actually named `waifu` or `waifu-fun`? (Almost certainly `waifu`, but needs confirmation before I unify the strings.)
3. **Is there a MongoDB Users collection still being written to?** Fastify's `ensureUserExists` writes to Mongoose `User` every auth hit. waifu-core writes to Postgres `creators`. Two identity stores running in parallel is a data-integrity risk.
4. **Auto-refresh preference:** wall-clock timer (eliza-cloud style) or trust SDK 0.7's opportunistic refresh? I'd recommend the timer for parity + predictability.
5. **Wallet ↔ Steward profile linking:** should we merge a wallet-first `creators` row with an email-first Steward login? Or allow dual profiles per human until someone asks?
6. **Server-side Steward user provisioning** (`STEWARD_PLATFORM_KEYS` + `ensureStewardUser`) — do we need it? No farcaster/telegram bridges today, so probably no.
7. **Is wallet-SIWE login still a supported entry point?** If yes, where does it route (Fastify cookies vs waifu-core SIWE)?

---

## Effort estimate

| Phase | Description | Size |
|-------|-------------|------|
| 1a | Fix tenantId `waifu-fun` → `waifu` everywhere in waifu-core | **S** (1-2h, mostly grep & replace + env set) |
| 1b | Add auto-refresh timer to WaifuStewardProvider | **S** (2-3h) |
| 1c | Clarify + act on Fastify backend status | **S-M** (1h audit + M if kill, S if document) |
| 2a | Bump `@stwd/react` 0.6.4 → 0.6.5 | **S** (15min) |
| 2b | Add Steward env vars to `.env.example` | **S** (15min) |
| 2c | Design token alignment for theme | **S** (1h) |
| 2d | Wallet↔Steward profile merge | **S-M** (4-6h) |
| 3a | `ensureStewardUser` parity | **S** (2-3h) |
| 3b | Rename dummy agentId | **S** (5min) |
| 3c | Gate dev-setup route | **S** (15min) |

**Total if done sequentially:** **M** (2-3 days of engineering). Compared to Babylon this is lighter — Babylon had a mobile app regression + Privy removal + file renames to do; waifu has a cleaner slate.

---

## First fix-it PR proposal

**Title:** `fix(steward): unify tenantId to "waifu" + add token auto-refresh`

**Scope:** Phases 1a + 1b. Two small, independently valuable changes in one PR (or split into two).

**Contents:**
1. `waifu-core/apps/api/src/routes/v2/agents.ts`, `services/agent-launch/orchestrator.ts`, `services/agent-launch/types.ts`, `scripts/test-agent-launch.ts`, `packages/db/src/schema/agent-wallets.ts` — replace `"waifu-fun"` with `"waifu"` consistently. Rely on `STEWARD_TENANT_ID` env override (default `"waifu"`).
2. `waifu.fun/apps/frontend/src/providers/steward-provider.tsx` — add inner `<StewardAutoRefresh>` child:
   - `useEffect` with `setInterval(60_000)` that calls `auth.isNearExpiry() && auth.refreshSession()`.
   - Uses `useAuth()` from `@stwd/react` to access the SDK instance.
   - Mirrors eliza-cloud's pattern in `packages/lib/providers/StewardProvider.tsx:64-170`.
3. Update `.env.example` in both `waifu.fun` and `waifu-core` with documented Steward vars.
4. Set `STEWARD_TENANT_ID=waifu` explicitly in prod env (Hetzner `docker-compose.prod.yml` / Vercel dashboard for the frontend).

**Why this first:** tenantId fix is a latent production bug (agent launch may target the wrong tenant). Auto-refresh is the same drill as Babylon's Phase 2. Both are small, reviewable, and don't touch UX. Phase 1c (Fastify backend sunset) should be a separate PR after Shadow decides the fate of `apps/backend`.

---

## Surprises found during research

1. **The integration is in better shape than Babylon was.** waifu uses `@stwd/react`'s blessed provider pattern, has current SDK versions, and has server-side Steward verification wired up with a sensible creator-resolution service. No Privy debt.
2. **There are three waifu repos**, not one. `waifu.fun` is the frontend + legacy Fastify backend; `waifu-core` is the new Hono backend deployed at `api.waifu.fun` and is where Steward JWT verification actually lives. The brief assumed single repo.
3. **Tenant string inconsistency (`waifu` vs `waifu-fun`)** is a real latent bug in waifu-core that would silently break agent launches against the wrong tenant. Worth fixing first.
4. **Two backends in parallel** — the Fastify `apps/backend` (port 3001, wallet SIWE, MongoDB User collection) overlaps with waifu-core (Hono, port 3100, Postgres creators, Steward JWT). Unclear if Fastify backend is still alive or deprecated. This is the biggest open question.
5. **No mobile app, no Capacitor.** That part of the Babylon brief doesn't apply. Nothing to do here.
6. **No custom identity bridges** (no Farcaster / Telegram / miniapp JWT issuers). So the "ghost user" problem is much smaller than Babylon — no bridged flows bypassing Steward's user table. The only subtle issue is the wallet-first + email-first dual `creators` row edge case.
7. **Wallet login and Steward login are treated as orthogonal in the UI** (`header-auth.tsx`). User can be Steward-authed only, wallet-connected only, both, or neither. This is intentional but creates UX complexity and two overlapping identity stores (Mongo User + Postgres creators + Steward).

---

*Plan written by Sol, 2026-04-16.*
