import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for waifu.fun frontend e2e.
 *
 * Test discovery: `tests/e2e/**\/*.spec.ts`
 * Default base URL: `http://127.0.0.1:3100` (static export served).
 * Override with `PLAYWRIGHT_BASE_URL=...` to run against a deployed env.
 *
 * Tests mock the backend API (`NEXT_PUBLIC_API_URL`) by intercepting routes
 * to a synthetic origin (`http://127.0.0.1:65535`). This keeps the suite
 * hermetic: no live `api.waifu.fun` dependency, no flakes from upstream
 * incidents. A closed loopback port also fails server-side fetches in
 * milliseconds (connection refused) instead of waiting on DNS lookups.
 *
 * Wallet flows are gated by the `wf_authed` cookie (frontend's auth flag)
 * and a `window.ethereum` shim. See `tests/e2e/fixtures/wallet.ts`.
 *
 * Important: `next dev` does NOT work as a backing server for this app.
 * The dev bundle is large enough that chromium's parser throws
 * `SyntaxError: Invalid or unexpected token` on the inlined eval-source-map
 * page chunks, and hydration never completes. We build the static export
 * (the same artifact we ship to Cloudflare Pages) and serve it with
 * `serve` instead. Set `PLAYWRIGHT_SKIP_BUILD=1` to skip the rebuild if
 * you've already produced `out/` locally.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const USING_EXTERNAL_BASE_URL = !!process.env.PLAYWRIGHT_BASE_URL;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const IS_CI = !!process.env.CI;

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: IS_CI,
	// One retry on CI for genuinely transient infra blips, zero locally so
	// flakes get fixed instead of papered over.
	retries: IS_CI ? 1 : 0,
	// Two workers on CI keeps wall time tolerable without hammering the
	// static server. Locally we cap at 4 to leave headroom for other dev
	// tasks; Playwright's default of half-CPU-count works too but explicit
	// is clearer.
	workers: IS_CI ? 2 : 4,
	reporter: IS_CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
	timeout: 30_000,
	expect: { timeout: 5_000 },
	outputDir: "test-results/",

	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chromium",
			use: { ...devices["Pixel 5"] },
			testMatch: /mobile-.*\.spec\.ts/,
		},
	],

	// Skip the local webServer when a deployed base URL is explicitly
	// provided. Note that route mocks in `fixtures/api-mock.ts` key off
	// `http://127.0.0.1:65535`, which is only baked into the local static
	// build. Running against a deployed host means the route patterns
	// won't fire and tests will hit the real backend, so the deployed
	// path is best used for smoke checks (titles, page reachability),
	// not the suite as-shipped.
	...(USING_EXTERNAL_BASE_URL
		? {}
		: {
				webServer: {
					command: process.env.PLAYWRIGHT_SKIP_BUILD
						? `bunx serve out -p ${PORT} -L`
						: `bun run build && bunx serve out -p ${PORT} -L`,
					url: BASE_URL,
					reuseExistingServer: !IS_CI,
					// First-time build can take up to ~3 minutes (static export +
					// generateStaticParams). After `out/` exists locally, subsequent
					// runs reuse the running server via `reuseExistingServer`.
					timeout: 300_000,
					stdout: "ignore" as const,
					stderr: "pipe" as const,
					env: {
						NEXT_PUBLIC_API_URL: "http://127.0.0.1:65535",
						NEXT_PUBLIC_HOST: BASE_URL,
						NEXT_PUBLIC_NETWORK: "mainnet",
						NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "waifu_fun_dev",
						NEXT_PUBLIC_DECIMALS: "18",
						NEXT_PUBLIC_TOKEN_SUPPLY: "1000000000",
						NEXT_PUBLIC_VIRTUAL_RESERVES: "30",
					},
				},
			}),
});
