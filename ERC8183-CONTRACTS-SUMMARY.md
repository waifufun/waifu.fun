# ERC-8183 Agentic-Commerce Escrow — Contracts Summary

**Branch:** `feat/erc8183-contracts`
**Package:** `packages/contracts-evm`
**Status:** TESTNET-FIRST. UNAUDITED. NOT FOR MAINNET MONEY.

Waifu's own ERC-8183-compatible escrow stack, deployed independently and injected into
Steward's vendor-neutral `@stwd/erc8183` TS client (the client presumes no deployment and
drives whatever addresses you give it). These contracts expose the exact ABI surface that
client expects, so the client can drive them unchanged.

---

## The three contracts

All live under `packages/contracts-evm/contracts/erc8183/` (Solidity `^0.8.24`, OZ v4.9.6,
`ReentrancyGuard` + `SafeERC20`, custom errors, `viaIR`).

### 1. `AgenticCommerce.sol` — job registry + escrow (custody)
The escrow. Holds the funded budget and is the only contract that moves value.

- `createJob(provider, router, expiredAt, description) -> jobId` — opens a job; caller is the
  client; emits `JobCreated(jobId indexed, client indexed, provider indexed, router, expiredAt,
  description)` (the client decodes `jobId` from the first indexed topic).
- `setBudget(jobId, amount)` — client-only, one-shot, while OPEN.
- `fund(jobId, amount)` — pulls `amount` of the injected ERC20 via `SafeERC20.safeTransferFrom`;
  `amount` must equal the set budget; OPEN -> FUNDED.
- `submit(jobId, deliverableHash)` — provider-only; FUNDED -> SUBMITTED.
- `dispute(jobId)` — client-only; SUBMITTED -> REJECTED (refundable immediately).
- `settleJob(jobId, policy)` — **router-only** (`msg.sender == job.router`); FUNDED/SUBMITTED ->
  SETTLED; releases the full budget to the provider. (The client's router `settle(jobId)` flows
  into this.)
- `claimRefund(jobId)` — client-only; returns escrow and sets REFUNDED. Reachable when
  FUNDED/SUBMITTED **and** `now >= expiredAt`, **or** immediately when REJECTED.
- `getJob(jobId) -> Job` / `getJobStatus(jobId) -> uint8` — views; revert `UnknownJob` for id 0.

The `Job` struct field order and the `JobStatus` enum exactly match `ERC8183-TYPES.txt`:
`id, status, client, provider, router, policy, budget, expiredAt, deliverableHash`.
Status codes: `0 OPEN, 1 FUNDED, 2 SUBMITTED, 3 SETTLED, 4 REJECTED, 5 REFUNDED`.

Payment token + all addresses are **injected** (constructor/args). Nothing hardcoded.

### 2. `EvaluatorRouter.sol` — settlement coordinator
The only address `AgenticCommerce` trusts to release a given job's escrow. Holds no funds.

- `registerJob(jobId, policy)` — binds a policy to a job, once; the job must name this router.
- `noteSubmission(jobId)` — permissionless; once a job is SUBMITTED, starts the optimistic clock
  by recording the observation time in the policy.
- `settle(jobId)` — reads the job, asks the bound policy `canSettle(job)`, and only on `true`
  calls `commerce.settleJob(jobId, policy)`. `nonReentrant` around the cross-contract release.

### 3. `OptimisticPolicy.sol` — optimistic settlement policy
A pure decision function (`ISettlementPolicy.canSettle`). Holds no funds.

- A SUBMITTED deliverable becomes settleable once the fixed challenge window has fully elapsed
  since the router observed it (`noteSubmission`), **unless** the client disputed (REJECTED is
  never settleable -> escrow refunds to the client).
- `challengeWindow` and the authorized `router` are injected at deploy time and immutable.
- `noteSubmission(jobId)` is router-only and first-write-wins (the provider can't reset the
  clock by re-submitting).

Interfaces: `interfaces/IAgenticCommerce.sol`, `IEvaluatorRouter.sol`, `ISettlementPolicy.sol`.

---

## Escrow flow + status machine

```
                       createJob            setBudget            fund
   (none) ───────────────▶ OPEN ──────────────▶ OPEN ───────────────▶ FUNDED
                          (client)        (budget set)        (ERC20 pulled into escrow)

   FUNDED ── submit(provider) ──▶ SUBMITTED
   FUNDED ───────────────────────────────────────────┐
   SUBMITTED ─────────────────────────────────────────┤
                                                       │
        router.settle  (policy.canSettle == true)      ▼
   FUNDED / SUBMITTED ─────────────────────────▶ SETTLED   (provider paid, terminal)

   SUBMITTED ── dispute(client) ──▶ REJECTED
   REJECTED ── claimRefund(client) ──▶ REFUNDED          (client refunded, terminal)

   FUNDED / SUBMITTED  + now >= expiredAt
        ── claimRefund(client) ──▶ REFUNDED              (client refunded, terminal)
```

Invariants:
- Escrow is released by exactly one of two paths: `settleJob` (router -> provider) or
  `claimRefund` (client). No admin withdraw, no third drain path.
- A funded job's value is **always** recoverable: if it never settles, the client can refund
  after `expiredAt`; if disputed, the client can refund immediately. **The refund path is always
  reachable** — no funds can be stranded.
- Check-effects-interactions on every value move; status flips before the token call;
  `nonReentrant` on `fund`, `settleJob`, `claimRefund`, and the router's `settle`.

---

## Test coverage — `test/erc8183-escrow.test.js` (18 passing)

- Happy path: create -> setBudget -> fund -> submit -> noteSubmission -> (window) -> settle;
  provider receives the full budget; escrow drained; `getJob` reflects SETTLED + policy + hash.
- Settle blocked before the challenge window elapses, and blocked if the clock was never started.
- Refund after expiry (client gets full budget); refund works even after a submission once
  expired; only the client can refund.
- Dispute: client rejects a submission and reclaims escrow immediately; a disputed job is not
  settleable; dispute is client-only and only from SUBMITTED.
- Guards: double-fund reverts, double-settle reverts, **only the bound router** can call
  `settleJob`, `setBudget` is client-only + one-shot, `fund` must match the budget exactly,
  `registerJob` binds once, unknown-job views revert, `createJob` rejects zero addresses / past
  expiry.
- Reentrancy: a malicious ERC20 that re-enters `fund()` during `transferFrom` is stopped by the
  guard; job stays OPEN, nothing escrowed (`contracts/mocks/ReentrantEscrowToken.sol`).

Payment token in tests uses the existing `contracts/mocks/ERC20Mock.sol`.

Run: `npx hardhat test test/erc8183-escrow.test.js` or `node scripts/run-hardhat-tests.cjs
test/erc8183-escrow.test.js`. `npx hardhat compile` → 0 errors (53 files).

---

## Deploy script — `scripts/deploy/deploy-erc8183.js`

Deploys all three contracts + resolves a payment token, wires them (router with a predicted
policy CREATE address, then the policy pointing back at the router — 1:1 binding, no setters),
and prints the four addresses in the exact `RequiredERC8183Addresses` shape:

```json
{
  "agenticCommerce":  "0x...",
  "evaluatorRouter":  "0x...",
  "optimisticPolicy": "0x...",
  "paymentToken":     "0x..."
}
```

- **Default chain: BSC TESTNET (chainId 97).** The script **hard-refuses chainId 56 (mainnet).**
- Payment token is injected via `ERC8183_PAYMENT_TOKEN` (required for a real-network deploy);
  on `localhost`/`hardhat` it auto-deploys `ERC20Mock` for end-to-end wiring.
- `ERC8183_CHALLENGE_WINDOW` (seconds, default 24h) sets the optimistic window.
- Writes a deployment record to `deployments/erc8183-<network>-<chainId>.json`.
- **The script was NOT broadcast to any real network.** It was exercised only against the
  in-process hardhat network to confirm wiring; that throwaway record was removed.

---

## ⚠️ AUDIT REQUIRED before mainnet

This is escrow that will eventually hold real value. It is **unaudited**. Do not put mainnet
money behind it until a professional audit clears the following risk surfaces:

1. **Escrow custody (`AgenticCommerce`).** All funded value sits in this one contract. Review the
   accounting per job vs. the contract's total token balance, fee-on-transfer / rebasing token
   incompatibility (the code assumes a standard ERC20 and credits the exact `amount`; a
   fee-on-transfer token would under-deliver and break the `budget` invariant — restrict the
   injected token accordingly), and the absence of any admin withdraw.
2. **Settlement authorization.** `settleJob` trusts `msg.sender == job.router` and pays the
   provider the full budget. Review the router as the sole release authority, the
   FUNDED/SUBMITTED -> SETTLED transition, and that no path lets a non-router or the provider
   self-settle. Review `EvaluatorRouter.settle` + the policy gate (`canSettle`) for any way to
   settle a disputed or unsubmitted job.
3. **Refund reachability.** Confirm a funded job can ALWAYS be refunded to the client — after
   `expiredAt` (FUNDED/SUBMITTED) or immediately when REJECTED — and that no status transition or
   reentrancy can strand escrow or enable a double-release (settle + refund on the same job).
4. **Policy / optimistic clock.** Review `OptimisticPolicy`: the first-write-wins
   `noteSubmission`, the strict `>` window comparison, and that a permissionless `noteSubmission`
   /`settle` can't be abused to settle early or to grief the provider.
5. **Reentrancy & ordering.** The unit test covers the `fund` callback; an auditor should fuzz
   the full state machine (Foundry/Echidna) for cross-function reentrancy and unexpected
   transition orderings, especially around `settleJob` ↔ `claimRefund`.

Recommended pre-mainnet: Slither + Echidna/Foundry invariant fuzzing (escrow-balance ==
sum of live job budgets; no job is ever both SETTLED and REFUNDED; refund always reachable for
funded value), then a third-party audit.
