# Playwright e2e

Browser-level smoke tests for the waifu.fun frontend. Lives alongside the
existing vitest unit suite but runs in a real chromium build.

## Running

First time only (or after a Playwright upgrade):

```sh
cd apps/frontend
bun run test:e2e:install   # downloads chromium + system deps
```

Then:

```sh
cd apps/frontend
bun run test:e2e           # builds out/, serves it, runs the suite
bun run test:e2e:ui        # same, in the Playwright UI
```

`playwright.config.ts` builds the static export (`out/`) and serves it via
`serve`. The build can take ~2-3 minutes the first time. Subsequent runs
reuse the running server (`reuseExistingServer: true`) when there isn't
already one bound to port 3100.

If you've already built and `out/` is fresh, skip the rebuild:

```sh
PLAYWRIGHT_SKIP_BUILD=1 bun run test:e2e
```

To run against a deployed environment for a manual smoke check:

```sh
PLAYWRIGHT_BASE_URL=https://dev.waifu.fun bun run test:e2e
```

Caveat: route mocks in `fixtures/api-mock.ts` key off the local-only API
host (`http://127.0.0.1:65535`). When you point the suite at a deployed
origin, those mocks won't intercept and tests that depend on stubbed
data (`launches-index.spec.ts`, etc) will see the real backend. The
deployed-base-URL mode is therefore most useful for the title /
reachability checks (homepage, mobile-smoke). For full coverage, run
locally.

## Why static export, not `next dev`

`next dev` produces an `eval-source-map` bundle for `/_next/static/chunks/app/page.js`
that's roughly 4MB. Headless chromium throws `SyntaxError: Invalid or unexpected
token` parsing it, and hydration never completes. The static export is the
artifact we ship to Cloudflare Pages anyway, so e2e against it doubles as a
production-bundle smoke test.

## API mocking

The frontend talks to `NEXT_PUBLIC_API_URL`. We point it at
`http://127.0.0.1:65535` (a closed loopback port) so unmocked requests fail
fast instead of waiting on DNS. Use the helpers in `fixtures/api-mock.ts`
to intercept specific endpoints:

```ts
import { installDefaultMocks, mockLaunchesList, fakeLaunch } from "./fixtures/api-mock";

test("launches index", async ({ page }) => {
	await mockLaunchesList(page, [fakeLaunch({ state: "open" })]);
	await page.goto("/launches");
	// ...
});
```

`installDefaultMocks` is the catch-all: empty agents grid, empty launches,
empty portfolio, 404 fallback for anything else. Use it on tests where you
don't care about specific API data.

## Wallet mocking

`fixtures/wallet.ts` injects an EIP-1193 + EIP-6963 compatible
`window.ethereum` shim before page load. It satisfies wagmi's `injected`
connector well enough to drive `eth_requestAccounts`, `personal_sign`, and
`wallet_switchEthereumChain` without going through RainbowKit's modal flow.

```ts
import { injectWallet, TEST_ADDRESS } from "./fixtures/wallet";

test("with wallet", async ({ page }) => {
	await injectWallet(page);                       // mock ethereum
	await page.goto("/some/route");
	// Tests that need wagmi-state-connected need an additional step
	// (drive the RainbowKit modal). Most flows can be tested via
	// the cookie-gated routes instead; see fixtures/auth.ts.
});
```

## Auth gating

`/patron/*` and `/create/*` are gated by the frontend's `wf_authed` cookie
+ a `useWaifuAuth()` call. `fixtures/auth.ts`'s `signIn` helper sets the
cookie and stubs `GET /v3/patron/me` so the gate passes.

```ts
import { signIn } from "./fixtures/auth";

test("portfolio shows positions", async ({ context, page, baseURL }) => {
	await signIn(context, page, baseURL!);
	await page.goto("/patron/portfolio");
});
```

## What's covered

| File | Covers |
| --- | --- |
| `homepage.spec.ts` | hero CTAs, footer internal links, page title |
| `launches-index.spec.ts` | empty state + card render with stubbed data |
| `wizard-validation.spec.ts` | the wizard's next-step gating |
| `portfolio-empty.spec.ts` | auth gate, wallet-not-connected empty state |
| `mobile-smoke.spec.ts` | no horizontal scroll on public pages at 393px |

## What's NOT covered (yet)

- Full wizard happy path (requires RainbowKit modal drive)
- Portfolio with positions (requires wagmi connected state)
- Visual regression baselines

These are explicit gaps. They're hard to do reliably without either driving
the real RainbowKit connect flow or vendoring a wagmi-state injection.

## Adding a new test

1. New spec file: `tests/e2e/<feature>.spec.ts`
2. Default mocks: `await installDefaultMocks(page)` in a `beforeEach`
3. Specific endpoints: add a helper to `fixtures/api-mock.ts` if it'll be
   reused; inline `page.route` if it's one-off
4. Auth-gated routes: `await signIn(context, page, baseURL!)`
5. Wallet-gated UX: `await injectWallet(page)` BEFORE `page.goto(...)`

## Updating screenshots

The current suite doesn't take golden screenshots. When that lands:

```sh
bunx playwright test --update-snapshots
```

Snapshots live under `tests/e2e/__screenshots__/` and ARE committed.

## Debugging failures

Traces are retained for any failing test:

```sh
bunx playwright show-trace test-results/<test>/trace.zip
```

The HTML report:

```sh
bunx playwright show-report
```
