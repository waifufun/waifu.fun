# BNB → Credits Bridge — Design + Reality Check (2026-06-03)

Author: Sol (Opus subagent) for Shadow. Branch: `feat/bnb-credits-bridge`.

## TL;DR (read this first)

**Shadow wants: "fund the agent on-chain (BSC/BNB) → that wakes its brain."**

The honest finding after reading both repos end to end:

1. There is **NO** programmatic, service-key credit-grant API on Eliza Cloud.
   **Every** inference-credit top-up requires a **real Stripe payment** (paid
   `payment_intent`). `topUpCredits()` returns a Stripe checkout URL, not a
   grant. `billing/checkout/verify` still requires `payment_status === "paid"`.
   The admin route is read-only.
2. So a true BNB→credits bridge **cannot be a pure code change inside
   waifu.fun.** It requires a **custodial off-ramp**: someone receives the BNB
   on-chain, and a funded account pays Eliza Cloud (Stripe or a future Eliza
   Cloud crypto/credit API) to mint the credits. The on-chain leg and the
   credit-mint leg are physically separate value transfers.
3. The wake mechanism that already works end-to-end is the **`credits.topped_up`
   webhook** from Eliza Cloud → waifu-core, which clears `dormant_at` and
   resumes the container. The bridge's job is to *trigger a real credit top-up
   so that webhook fires.*

**Recommendation:** ship the honest UI now (done in this PR), and build the
bridge as a **backend "treasury→credits" watcher with a platform-funded credit
buffer** (Option A below), gated behind Shadow's greenlight because it spends
real money and needs an operator-funded Stripe/credit account.

---

## 1. The current flow, every hop (what's real today)

### 1a. Dormancy (sleep) — WORKS
```
Eliza Cloud agent runs out of credits
  → Eliza Cloud POSTs webhook {event: credits.depleted} to waifu-core
     (apps/api/src/routes/v2/webhooks.ts → mapElizaCredits → "agent.credits.depleted")
  → dispatchEvent → handleCreditsDepleted
     (apps/api/src/services/webhook-consumer/index.ts:180)
       - posts "last words" tweet
       - store.markDormant(agentId)  →  agent_personas.dormant_at = now
       - pauseAgentContainer()        →  elizaCloud.pauseAgent(runtimeId) (suspend)
       - marks runtime overlay dormant
       - emits agent.dormant
```

### 1b. Wake (resurrect) — TWO real paths, BOTH end in Stripe-paid credits

**Path 1 — webhook (the canonical one):**
```
Credits added on Eliza Cloud (via Stripe payment)
  → Eliza Cloud POSTs {event: credits.topped_up}
  → dispatchEvent → handleCreditsToppedUp (webhook-consumer/index.ts)
       - resumeAgentContainer()  →  elizaCloud.resumeAgent(runtimeId)
       - agent_personas: dormant_at = null, brain_paused_at = null,
         model_tier = premium, credits_top_up_count++
       - emits agent.resurrected
```

**Path 2 — `POST /v2/agents/:id/resurrect` (patron-initiated, apps/api/src/routes/v2/agents.ts:563):**
```
requirePatron + requireAgentOwnership
  → resurrectAgent(agentId, creditsAmount /* USD cents */)
       - elizaClient.topUpCredits(controlAgentId, cents/100)
            → POST eliza-cloud /api/v1/credits/checkout
            → returns a Stripe CHECKOUT URL (does NOT grant credits!)
       - elizaClient.resumeAgent(containerId)
       - agent_personas: dormant_at = null, credits_top_up_count++
```
**⚠ Bug/footgun in the existing resurrect path:** it clears `dormant_at`
*optimistically* and calls `resumeAgent`, but `topUpCredits` only creates a
Stripe checkout session — **no credits are actually added** unless the patron
goes and pays that Stripe URL (which the endpoint discards). So an agent
"resurrected" via this endpoint with no real payment will wake with **$0
credits and immediately re-deplete.** This is a real latent issue worth flagging
to Shadow independent of the BNB bridge.

### 1c. On-chain funding (TopUp / LiFi) — WORKS but funds the WRONG pool
```
apps/frontend .../wave-t/topup-panel.tsx  (defaults to Base, supports BSC chain 56)
  → GET  /v2/agents/:address/topup/quote   (apps/api/src/routes/v2/topup.ts)
       - resolves agent SAFE from agent_safes via agent_personas
       - LiFi quote, allowlisted bridges, 0.5% slippage cap, 0% fee
       - destination is HARDCODED to Arbitrum USDC (chain 42161) into the Safe
  → patron signs tx in their own wallet (no Steward)
  → POST /v2/agents/:address/topup/status  (LiFi status polling)
```
This raises **treasury NAV** (and `runwayDays`, display only). It does **NOT**
touch Eliza Cloud credits and does **NOT** clear `dormant_at`. **Funding the Safe
on BSC does not wake the brain today.** This is THE GAP.

### 1d. runwayDays — DISPLAY ONLY
`apps/api/src/services/nav/burn-rate.ts` computes `treasuryNAV / 24h BNB burn`.
Nothing reads it to sleep/wake. Pure dashboard number.

---

## 2. The conversion question — how does on-chain BNB become cloud credits?

This is the crux. On-chain BNB is in a Safe/treasury on BSC. Eliza Cloud credits
are a USD balance on an **organization** record, mintable **only by a paid
Stripe payment_intent**. There is no on-chain→credit primitive anywhere. So
*someone with fiat/Stripe access must pay Eliza Cloud*, and *someone must be
compensated in BNB on-chain*. The three ways to wire that:

### Option A — Backend treasury-deposit watcher + platform credit buffer (RECOMMENDED)
- A waifu-core watcher detects **new inbound deposits to the agent Safe on BSC**
  (we already fetch Safe tx history in burn-rate.ts via Ankr/BscScan).
- On a qualifying deposit (or on patron pressing "convert"), waifu-core converts
  a configurable **portion** (e.g. a `creditsShareBps`) of the deposit's USD
  value into Eliza Cloud credits by having the **platform's funded Eliza Cloud
  org** pay for the credits (platform fronts the Stripe/credit cost), then
  routes the equivalent BNB from the agent Safe to the platform fee wallet to
  reimburse. The platform is the off-ramp.
- Wake is automatic: the real credit top-up fires Eliza Cloud's
  `credits.topped_up` webhook → existing `handleCreditsToppedUp` clears
  `dormant_at`.
- **Custody:** platform custodies the credit buffer + the BNB reimbursement leg.
- **Price oracle:** BNB→USD already exists (`fetchBnbPriceUsd` /
  coingecko.ts). Reuse it; snapshot price at conversion time.
- **Double-spend / draining protection:** keep **two logical pools**:
  `treasury (trading capital)` and `inference (credits)`. Only a bounded,
  configurable slice of each deposit (or an explicit patron "fund brain" action)
  is eligible for conversion. A per-agent + per-window cap and idempotency on the
  deposit tx hash prevent re-crediting the same deposit.
- **Tradeoffs:** requires a **platform-funded credit buffer** (real money up
  front) and a reconciliation job. It's the only option that makes "BSC funding
  wakes the agent" feel automatic AND honest. Needs Shadow to fund + greenlight.

### Option B — Explicit patron "convert treasury → credits" action
- Patron, on the dormant page, presses "wake the brain", which calls a
  waifu-core endpoint that (a) pulls a chosen USD amount of credits via the
  platform buffer and (b) debits the agent Safe by the BNB equivalent.
- Same custody/oracle/cap machinery as A, but **patron-triggered** rather than
  auto-on-deposit. Less magical, more legible, less risk of surprise credit
  spend. Good **first** shippable once the buffer exists.
- Tradeoff: not "fund Safe → auto-wake"; it's a deliberate two-step.

### Option C — Auto-resurrect when treasury funded above a threshold
- A watcher flips dormant→awake purely on treasury NAV crossing a threshold,
  calling resurrect.
- **Rejected as a standalone:** resurrect today does NOT actually add credits
  (see 1b footgun), so the agent would wake to $0 and instantly redeplete. It
  becomes viable only layered on top of A/B (i.e. the threshold triggers a
  *real* credit conversion, not a bare resurrect).

**Recommendation: Option A as the destination, Option B as the first safe step**
(same plumbing, patron-gated, lower blast radius), both sitting on a
platform-funded credit buffer. Trading capital (Safe) and inference credits stay
**SEPARATE pools** — conflating them risks draining trading capital to pay for
thinking, which Shadow explicitly flagged.

### Why not "just send BNB straight to Eliza Cloud"?
Eliza Cloud has no crypto-deposit credit endpoint today (checked: only Stripe).
If/when Eliza Cloud ships an on-chain credit-purchase API (it's the same team —
Shaw), Option A collapses into a single hop and the platform buffer disappears.
**Flag for Shadow: the cleanest long-term fix lives in Eliza Cloud, not
waifu.fun** — a service-key `POST /api/v1/credits/grant` (or a crypto checkout)
would let waifu-core mint credits directly against an on-chain receipt.

---

## 3. The honest interim (smallest real thing THIS week)

Two tiers:

**Interim-0 (shipped in this PR, no money, no risk):**
- On the patron/dormant surface, surface the existing on-chain funding path
  PROMINENTLY, and **label it honestly**: "fund treasury (trading capital)" is
  clearly distinguished from "add inference credits (wakes the agent)". We do
  NOT imply that funding the Safe wakes the brain, because today it doesn't.
- Point the "wake the agent" affordance at the **real** credit path
  (`/resurrect`, which routes to a Stripe checkout), with copy that's honest
  about it being a credit purchase.

**Interim-1 (small, needs Shadow greenlight — NOT auto-built here):**
- Add a patron-gated `POST /v2/agents/:id/credits` that wraps the **Option B**
  patron-triggered conversion against a platform credit buffer. This is ~1
  endpoint + 1 reconciliation row + the existing webhook does the wake. It is
  deliberately **left for Shadow to greenlight** because it spends real money
  (the platform buffer) and needs the platform Eliza Cloud org funded.

**What does NOT fit this week:** the full auto-on-deposit watcher (Option A) with
reconciliation, BNB reimbursement routing, and per-window caps. That's a real
multi-day build with money movement. Designed here, not built.

---

## 4. Eliza Cloud side — what `topUpCredits` actually does (verified live)

- `elizaClient.topUpCredits(agentId, usd)` → `POST /api/v1/credits/checkout`
  with `{credits, success_url, cancel_url}`. The route
  (`eliza-cloud/apps/api/v1/credits/checkout/route.ts`) creates a **Stripe
  Checkout Session** and returns its URL. **It does not move any balance.**
- Credits are actually added by `creditsService.addCredits({organizationId,
  amount, stripePaymentIntentId})`, called only from:
  - `apps/api/src/queue/stripe-event.ts` (Stripe webhook, after real payment), and
  - `apps/api/billing/checkout/verify/route.ts` (success-page fallback, still
    requires `session.payment_status === "paid"` + a `payment_intent`).
- **There is no service-key / admin credit-grant endpoint.** `apps/api/v1/admin/orgs`
  is GET-only. So **waifu-core cannot mint credits without a real Stripe payment.**
- Live probes (read-only, with the prod waifu-core `ELIZA_CLOUD_API_KEY`):
  - `GET /api/v1/credits/balance?agent_id=4f2cb05b...` → `{"balance":9.388...}`
    (Sol's agent currently has ~$9.39, i.e. NOT actually depleted right now;
    `credits_top_up_count=0`, `dormant_at` empty in DB).
  - Service key (`X-Service-Key`) → `Invalid or expired API key`. The **API key
    (Bearer)** is the working credential for credit reads.

**Action item for Shadow / Shaw:** the *correct* place for the bridge primitive
is an Eliza Cloud endpoint that mints credits against an on-chain receipt or a
service grant (so waifu-core doesn't need a Stripe buffer). Without it, any
waifu-side bridge must front fiat via the platform org.

---

## 5. Concrete build plan (when greenlit)

1. **Eliza Cloud (Shaw):** add `POST /api/v1/credits/grant` (service-key auth,
   idempotent on an third-party ref e.g. on-chain tx hash) OR a crypto-checkout
   that accepts an on-chain payment receipt. This removes the platform buffer.
2. **waifu-core (Option B first):** `POST /v2/agents/:id/credits` (requirePatron
   + ownership): body `{usdAmount}`; debits agent Safe by BNB-equivalent (priced
   via coingecko snapshot), calls the Eliza Cloud grant (or buffer-funded
   checkout-verify), records a `credit_conversion` row idempotent on tx hash,
   relies on `credits.topped_up` webhook to clear `dormant_at`.
3. **waifu-core (Option A later):** Safe-deposit watcher (extend burn-rate's
   Ankr/BscScan polling) that auto-converts a `creditsShareBps` slice of new
   deposits, with per-window caps + idempotency.
4. **Pools:** add explicit accounting so trading capital vs inference credits are
   never silently co-mingled.

---

## 6. Fix the latent resurrect footgun (independent of bridge)

`resurrectAgent` clears `dormant_at` and resumes the container after calling
`topUpCredits`, but `topUpCredits` only creates a Stripe checkout — no credits
are added. So `/v2/agents/:id/resurrect` can wake an agent to $0 credits.
Recommend: either (a) have resurrect return the checkout URL and NOT clear
`dormant_at` until `credits.topped_up` fires, or (b) verify a real balance bump
before clearing dormancy. Flagging for Shadow; not changed in this PR to avoid
touching the live wake path without review.
