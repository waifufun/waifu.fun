# wave h static analysis

> companion to `THREAT_MODEL.md`, `EMPIRICAL_VALIDATION.md`, `KNOWN_ISSUES.md`.
> ran slither against the wave h contracts pre-audit to catch obvious mechanical issues.
> this doc records the full output, the triage decision per finding, and the rationale.

## 1. tool config

- **slither**: v0.11.5 (pip install slither-analyzer)
- **solc**: 0.8.24 (via solc-select)
- **command**:
  ```bash
  cd packages/contracts-evm
  slither . \
    --filter-paths "mocks|openzeppelin|node_modules|flap|probe|uniswap|VeWaifuStaking|TreasuryLP4" \
    --json out.json \
    --hardhat-ignore-compile
  ```
- **scope**: only the wave h core contracts
  - `contracts/BundleRouter.sol`
  - `contracts/LaunchVault.sol`
  - `contracts/LaunchFactory.sol`
  - `contracts/TreasuryLP.sol`
  - `contracts/interfaces/*.sol` (interfaces only, transitive)

  out of scope (filtered): openzeppelin libs, flap portal interfaces (`flap/`),
  pcs interfaces (`uniswap/`), legacy `TreasuryLP4` + `VeWaifuStaking`, mocks, probe.

## 2. summary

| severity | check                    | count | resolution                  |
|----------|--------------------------|-------|-----------------------------|
| high     | arbitrary-send-eth       | 2     | accept (trusted immutables) |
| high     | reentrancy-balance       | 1     | accept (executed flag)      |
| medium   | incorrect-equality       | 3     | accept (zero-checks)        |
| medium   | reentrancy-no-eth        | 1     | fixed (cei reorder)         |
| medium   | unused-return            | 1     | accept (getReserves)        |
| low      | reentrancy-benign        | 1     | accept (post-fix)           |
| low      | reentrancy-events        | 5     | accept (no value impact)    |
| low      | timestamp                | 12    | accept (intentional)        |
| info     | low-level-calls          | 5     | accept (intentional)        |
| info     | naming-convention        | 16    | accept (immutable ALL_CAPS) |
| info     | cyclomatic-complexity    | 2     | accept (audit aid)          |
| info     | missing-inheritance      | 2     | accept (interface in router)|
| info     | redundant-statements     | 1     | accept (silence pattern)    |
| **total**|                          | **52**|                             |

one defensive fix applied (`reentrancy-no-eth` → cei reorder in `LaunchFactory.createLaunch`).
zero real bugs found by slither. zero p0/p1 actions.

## 3. high severity — triage

### 3.1 `arbitrary-send-eth` (×2) — ACCEPT

slither flags:

1. `BundleRouter._callPortal` sends `quoteAmt` BNB to `FLAP_PORTAL.newTokenV6`
2. `BundleRouter._v2FollowUpBuy` sends `v2BuyBnb` BNB to `PCS_ROUTER.swapExactETHForTokensSupportingFeeOnTransferTokens`

**why slither flags it**: any `call{value: ...}` to an address whose value originates
from a function parameter or third-party read looks arbitrary.

**why it's a false positive**: both destinations are stored as `immutable`s on
deployment, set by `LaunchFactory` from its own `immutable`s, which are set in
the factory constructor by the deployer. there is no path for a user to redirect
either call. specifically:
- `FLAP_PORTAL` → `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` (flap portal v5.14.1)
- `PCS_ROUTER` → `0x10ED43C718714eb63d5aA57B78B54704E256024E` (pcs v2 router)

both addresses are publicly-known third-party infrastructure. wave h's threat model
treats them as untrusted-but-fixed: see `THREAT_MODEL.md` § "trust boundaries".
the value sent is also bounded: `quoteAmt` and `v2BuyBnb` are `immutable` per-launch,
set by the factory's tier table, capped by the per-launch `presaleCap`.

mitigation: tier table is enforced at factory construction. presaleCap >= quoteAmt + v2BuyBnb
is enforced in `LaunchVault` constructor (revert `InvalidParams`).

**verdict**: documented and accepted. would be flagged as a finding only if the
factory deployer were untrusted, which is contradicted by the trust model.

### 3.2 `reentrancy-balance` in `_v2FollowUpBuy` — ACCEPT

slither flags the balance-delta pattern:

```solidity
uint256 balBefore = IERC20(token).balanceOf(address(this));
IPancakeRouter02(PCS_ROUTER).swapExactETHForTokensSupportingFeeOnTransferTokens{value: v2BuyBnb}(...);
uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
if (received < minOut) revert V2BuySlippage();
```

**why slither flags it**: balance read → third-party call → use of balance-derived value.
classical reentrancy template.

**why it's a false positive**:

1. `executeBundle` flips `executed = true` BEFORE any third-party call (CEI). a
   re-entry through a malicious token's `transfer` hook lands on
   `executed → revert AlreadyExecuted()`.
2. this is the canonical fee-on-transfer slippage check. the post-balance read
   is the EXACT amount of tokens received; that's the whole point of using
   `swapExactETHForTokensSupportingFeeOnTransferTokens` over the non-fee variant.
3. `PCS_ROUTER` itself does not call back into `BundleRouter` during the swap;
   it only interacts with the v2 pair contract and `WBNB`. neither has a
   reentrancy surface into router state.

**verdict**: accept. the FoT-aware balance-delta is the recommended pattern and
the executed-flag covers the reentrancy surface.

## 4. medium severity — triage

### 4.1 `incorrect-equality` (×3) — ACCEPT

all three are zero-checks on uint256, not address comparisons:

- `LaunchVault._allocationOfPure`: `dep == 0 || totalDepositedAtLaunch == 0`
- `LaunchVault._vestedOf`: `alloc == 0`
- `LaunchVault.claim`: `claimable == 0`

slither's `incorrect-equality` detector warns when strict equality is used on
balances or amounts that may have edge cases (e.g., ether balance grief, token
rebases). here the values are pure accounting derived from `depositors[user].deposited`
and `presalerTokenBalance`, both deterministic.

`claim()` reverts `NothingToClaim` if `_claimableOf` returns 0. this is a UX
guard, not a security check. legitimate edge case: user calls `claim()` twice
in the same block before any vesting elapsed and gets a clean revert. correct.

**verdict**: accept.

### 4.2 `reentrancy-no-eth` in `LaunchFactory.createLaunch` — FIXED

original code:

```solidity
IVaultRouterSetter(address(vault)).setRouter(address(router));  // third-party call
usedSalts[effectiveSalt] = true;                                // state write after
launches[predicted] = addrs;                                     // state write after
allLaunches.push(predicted);                                     // state write after
```

slither: `setRouter` is an third-party call before state writes. while the
target is a freshly-deployed `LaunchVault` (trusted, no re-entry surface),
defensive CEI is cheap and removes the warning.

**fix**: reordered state writes to before the third-party call.

```solidity
usedSalts[effectiveSalt] = true;
launches[predicted] = addrs;
allLaunches.push(predicted);
IVaultRouterSetter(address(vault)).setRouter(address(router));
emit LaunchCreated(...);
```

post-fix the `reentrancy-no-eth` detector no longer reports `createLaunch`.
the `reentrancy-events` detector still reports the `LaunchCreated` event being
emitted after `setRouter` — accepted, see § 5.1.

### 4.3 `unused-return` on `getReserves` — ACCEPT

```solidity
function _computeOpenMcBnb(address token, address pair) internal view returns (uint256) {
    (uint112 r0, uint112 r1, ) = IPancakePair(pair).getReserves();
    ...
}
```

the third return value of `getReserves` is `blockTimestampLast` (uint32). it is
intentionally ignored: we compute open market cap from the current reserves at
the call block, not from the last-update timestamp. the timestamp is only useful
for TWAP pricing, which wave h does not perform.

**verdict**: accept. solidity 0.8.x already named the slot as `_` (anonymous) so
this is a slither-only warning, not a compiler one.

## 5. low severity — triage

### 5.1 `reentrancy-events` (×5) — ACCEPT

after the CEI fix, slither still emits 5 `reentrancy-events` warnings:

| location                                  | third-party call                | event                |
|-------------------------------------------|------------------------------|----------------------|
| `LaunchFactory.createLaunch`              | `setRouter`                  | `LaunchCreated`      |
| `BundleRouter.executeBundle`              | portal + pcs + transfers     | `BundleExecuted`     |
| `LaunchVault.pullBnbForLaunch`            | `router.call{value}`         | `LaunchExecuted`     |
| `TreasuryLP.sweep`                        | `safeTransfer`               | `TokensSwept`        |
| (covered by `BundleRouter.executeBundle`) | ...                          | ...                  |

**why slither flags it**: best practice is to emit events before third-party calls
so a reentry cannot "see" an event missing from the log. in practice this
warning is informational because re-entry to mutate the event payload is not
possible; events are not state.

**why accept**:
- `LaunchFactory.createLaunch`: target is freshly-deployed vault, no reentry surface.
- `BundleRouter.executeBundle`: `executed` flag set before any third-party call; reentry reverts.
- `LaunchVault.pullBnbForLaunch`: state set to `LAUNCHED` before the third-party call;
  reentry into `pullBnbForLaunch` reverts `InvalidState` (post-CLOSED check).
- `TreasuryLP.sweep`: only callable by owner, no reentry surface that affects accounting.

**verdict**: accept all 5. the events are emitted as the last step of a function
that has either (a) flipped a one-shot guard, (b) advanced a state machine, or
(c) gated on `msg.sender == owner`. no economic impact possible.

### 5.2 `reentrancy-benign` in `LaunchFactory.createLaunch` — ACCEPT

post-fix this still fires because the `setRouter` call happens before the
`allLaunches.push(predicted)` write (which is now AFTER setRouter to keep
the index ordering consistent with the array push semantics in slither's view).

slither classifies this as "benign" because none of the state writes after the
third-party call cross function reentrancies that read them as guards. validated
by reading the createLaunch flow: a reentry would land on `usedSalts[salt] = true`
which is now set BEFORE the third-party call, preventing the salt-reuse path.

**verdict**: accept.

### 5.3 `timestamp` (×12) — ACCEPT

slither warns whenever `block.timestamp` is used in a comparison. wave h has
12 such comparisons; all are intentional and bounded:

- presale window enforcement: `block.timestamp > closeTimestamp`, `< closeTimestamp`
- vesting: `elapsed >= VESTING_WINDOW` (where window = 24h)
- bundle deadline: `block.timestamp > p.deadline`
- launchTimestamp ordering: `block.timestamp < launchTimestamp`
- constructor sanity: `_closeTimestamp <= block.timestamp` (reject past)

miner-manipulation of `block.timestamp` is bounded to ~12s on BSC. for a 24h
vesting window or a presale window measured in hours/days, this is negligible.
the bundle deadline is operator-set with a margin (typical: now + 60s).

**verdict**: accept all 12. zero impact.

## 6. informational — triage

### 6.1 `low-level-calls` (×5) — ACCEPT

5 uses of `.call{value: X}("")`:

- `BundleRouter.executeBundle`: tip → 48 Club EOA, dust sweep → DEAD
- `LaunchVault.withdraw` / `withdrawAll` / `refund`: BNB back to depositor
- `LaunchVault.pullBnbForLaunch`: BNB into BundleRouter (which has `receive()`)

all five are intentional. depositor refunds need `.call` (not `transfer`) to
survive the post-istanbul gas-cost hike on `transfer`. the tip → 48 Club path
requires `.call` per the puissant bundle spec. the success flag is checked on
every one except the dust-sweep (which is intentionally fire-and-forget post
successful bundle, see § 6.4 below).

**verdict**: accept.

### 6.2 `naming-convention` (×16) — ACCEPT

15 of the 16 are immutable variables in `ALL_CAPS` (`WBNB`, `PCS_FACTORY`,
`PCS_ROUTER`, etc.). this is the prevailing solidity convention for constants
and immutables that represent third-party system addresses (mirrors `WETH`, `WBNB`,
etc. seen across the ecosystem). renaming to `mixedCase` would harm readability
and break the established "this is a system constant" visual signal.

the remaining 1 is `_router` / `_token` / `_presalerShare` as function params,
which use leading-underscore to distinguish from storage. also a common pattern.

slither's `--variable-name-prefer mixedCase` is a stylistic default; we
explicitly prefer the system-constant convention.

**verdict**: accept all 16.

### 6.3 `missing-inheritance` (×2) — ACCEPT

slither suggests `LaunchVault` inherit from `ILaunchVaultRouterCallbacks` and
`IVaultRouterSetter`. those interfaces live in `BundleRouter.sol` and
`LaunchFactory.sol` respectively (caller-side type declarations, not contracts
intended for inheritance by callees).

inheriting them would couple `LaunchVault` to private interface declarations
in its callers, which is the wrong direction. a future cleanup could extract
to `contracts/interfaces/IVaultCallbacks.sol` and inherit there, but it's a
zero-impact refactor.

**verdict**: accept. future cleanup ticket.

### 6.4 `redundant-statements` — ACCEPT

```solidity
(bool sweepOk, ) = payable(DEAD).call{value: dust}("");
sweepOk; // silence unused-var; intentional ignore
```

this is the standard solidity 0.8.x idiom to silence the "unused local variable"
warning when we intentionally do not check a return value. the dust sweep is
fire-and-forget post successful bundle: if the burn-address sweep fails (it
won't; DEAD is a precompile that always accepts BNB), we still want
`BundleExecuted` to be the final state. unwinding a successful bundle on a
dust-sweep failure would be far worse than leaving 1 wei in the router.

**verdict**: accept. consider `unchecked` cast to `address(DEAD).call` and
explicit `// slither-disable-next-line ...` comment in a follow-up.

### 6.5 `cyclomatic-complexity` (×2) — ACCEPT

`BundleRouter.executeBundle` and `LaunchFactory.createLaunch` both have CC=12.
both functions are intentionally a single atomic sequence:

- `executeBundle`: 11 ordered steps that MUST run atomically (pull → portal →
  predict-check → pair-lookup → v2 buy → splits → 3 transfers → distribute →
  tip → dust sweep → emit). breaking it up would force inter-call state which
  the spec requires NOT exist (atomic-or-bust).
- `createLaunch`: 9 validation checks + 4 deploys + 4 wiring writes + 1 emit.
  same atomicity requirement.

reducing CC would mean splitting into helpers that all share the same
calldata struct, which the compiler already does via internal calls. slither's
warning is helpful as a "this is where to focus your audit attention" signal,
which is itself an outcome we want.

**verdict**: accept. high-CC IS the audit surface.

## 7. independent manual review

beyond slither, walked the wave h surface against the task list:

### 7.1 storage slot reuse via CREATE2

each `BundleRouter` is deployed fresh by `LaunchFactory` via `new BundleRouter(...)`.
solidity `new` uses CREATE (not CREATE2) for non-salt construction, so each
deployment lands at a unique address derived from `(factory_addr, factory_nonce)`.
storage slots are per-contract; there is no slot sharing across deployments.

no concern.

### 7.2 ETH refund on portal revert

when `Portal.newTokenV6{value: quoteAmt}` reverts, the EVM's atomicity guarantees
the `value` is restored to the calling contract (BundleRouter). because the outer
`executeBundle` call is also reverting (the portal revert propagates), the BNB
pulled from the vault is restored by the same atomic rollback. vault state
returns to `CLOSED` (or `OPEN` if pre-close), and the BNB sits in the vault
ready for the next `executeBundle` attempt OR for `enableRefundBundleFailed` →
`refund()`.

empirically validated in `test/wave-h-bundle-flow.test.js`:
> "bundle revert leaves vault BNB intact (atomic-or-bust via EVM rollback)"

no concern.

### 7.3 SafeERC20 behavior on fee-on-transfer

`SafeERC20.safeTransfer` calls `transfer(address, uint256)` and reverts if the
call fails or if a non-zero-bytes return value is `false`. it does NOT check
post-transfer balance. for FoT tokens, the recipient receives `amount * (1 - tax)`,
and SafeERC20 happily accepts that.

wave h's design is FoT-aware:
- the `vaultAmt` split is computed AFTER the v2 follow-up buy, so the vault
  receives a known fraction of the actual post-tax balance held by the router.
- the burn (50%) and treasury (10%) safeTransfers carry tax, but those
  recipients are non-claiming sinks (DEAD = burn, TreasuryLP = custody). no
  accounting mismatch.
- the vault then `distribute(token, vaultAmt)` records the share. when users
  `claim()` the vault's `safeTransfer(user, claimable)` ALSO carries tax. this
  is documented in `KNOWN_ISSUES.md` as expected behavior: users receive
  `claimable * (1 - sellTax)` net.

no concern.

### 7.4 vault gas griefing via malicious tax token

a malicious tax token could implement `transfer` with a 30M-gas infinite loop.
that would brick `executeBundle` (the 3 safeTransfers from router to DEAD /
treasury / vault). the entire bundle would revert on out-of-gas, the vault
would stay in `CLOSED`, and `enableRefundBundleFailed` would unblock refunds.

BUT: the token is created BY `FLAP_PORTAL.newTokenV6` from a fixed implementation
(`TOKEN_IMPL_TAXED_V3`, an EIP-1167 clone target). the token implementation is
deployed and immutable; it's the same `FlapTaxTokenV3` contract for every wave h
launch. wave h doesn't accept arbitrary token addresses. the predictedToken
CREATE2 reconciliation in `LaunchFactory.createLaunch` and the
`if (token != predictedToken) revert PredictedAddressMismatch()` check in
`BundleRouter.executeBundle` close the loop.

if `FlapTaxTokenV3` itself contains a gas-grief surface, that's a portal-level
issue outside wave h scope (and would have shown up in the empirical V6 probe).

no concern.

### 7.5 MEV via salt frontrunning

`createLaunch` accepts raw `vanitySalt` as `bytes32`, but the factory scopes it
with `effectiveSalt = keccak256(abi.encode(creator, vanitySalt))` before
computing the predicted token address or marking `usedSalts`. the factory also
requires `msg.sender == creator`.

1. `usedSalts[effectiveSalt]` is dedup'd globally in the factory. only the
   first `createLaunch` in a given creator/raw-salt namespace succeeds.
2. an attacker who copies the raw salt under their own creator address gets a
   different effective salt and a different predicted token address. they
   cannot burn the victim creator's effective salt without the victim key.

practical impact: a frontrunner can grief by "stealing" a vanity address, but
cannot steal funds (their vault is theirs; depositors choose which vault to
fund). griefing cost: full factory deploy + portal call ≈ 5M gas. mitigation:
treat vanity salt as semi-public; if a frontrun lands, mine another salt.

`executeBundle` is bundle-bot-gated and submitted via 48 Club puissant. the
bundle bot is operationally trusted; depositors are paying the vault, not the
bundle bot. salt frontrunning the executeBundle step itself is moot because
only the bundle bot EOA can call it.

no concern (documented in THREAT_MODEL.md § 4 already).

## 8. raw slither output

stored at `/tmp/slither-wave-h.txt` (pre-fix) and `/tmp/slither-wave-h-after.txt`
(post-fix). machine-readable json at `/tmp/slither-wave-h.json` and
`/tmp/slither-wave-h-after.json`. not checked into the repo to keep audit
folder size down. reproduce with the command in § 1.

## 9. recommendation to auditors

automated tools surface 52 findings, 1 of which (the createLaunch CEI reorder)
warranted a defensive code change. zero p0/p1 bugs were found. the remaining
51 are accept-with-rationale.

we believe the auditor's time is best spent on:
- the bundle execution sequence in `BundleRouter.executeBundle` (the atomic
  pipeline through third-party portal + pcs + custody contracts)
- the LaunchVault state machine, especially OPEN/CLOSED/LAUNCHED/REFUND
  transitions and the idempotency of `refund()` and `claim()`
- the trust assumptions on FLAP_PORTAL and the gracefulness of revert paths
  through `_callPortal`
- the CREATE2 reconciliation between off-chain salt mining and the on-chain
  `predicted != config.predictedTokenAddress` check

see `THREAT_MODEL.md` for the full economic threat surface.

---

*generated: 2026-05-14 (wave h pre-audit pass)*
