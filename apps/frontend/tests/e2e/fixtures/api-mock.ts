/**
 * API mocking helpers.
 *
 * The frontend talks to `NEXT_PUBLIC_API_URL`, which we point at a
 * closed loopback port (`http://127.0.0.1:65535`) for tests (see
 * `playwright.config.ts`). Routes are intercepted via `page.route` so
 * no live API is touched, and any un-mocked request fails fast with
 * ECONNREFUSED instead of hanging on DNS resolution.
 *
 * Each helper installs a route handler for a single endpoint. Compose
 * them per-test for fine-grained control over what data the UI sees.
 */
import type { Page, Route } from "@playwright/test";

export const API_HOST = "http://127.0.0.1:65535";

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
	route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});

/**
 * Stub `GET /v2/launches`. Pass `launches` to control the list.
 * Empty array = the /launches page shows its empty state.
 */
export async function mockLaunchesList(page: Page, launches: Array<Record<string, unknown>> = []): Promise<void> {
	await page.route(`${API_HOST}/v2/launches**`, (route) =>
		json(route, {
			ok: true,
			data: {
				launches,
				total: launches.length,
				limit: 30,
				offset: 0,
			},
		}),
	);
}

/**
 * Stub `GET /v2/users/:address/launches`, the patron portfolio
 * aggregate. Default is empty so portfolio shows empty state.
 */
export async function mockPortfolio(page: Page, entries: Array<Record<string, unknown>> = []): Promise<void> {
	await page.route(`${API_HOST}/v2/users/**`, (route) =>
		json(route, { ok: true, data: { launches: entries, count: entries.length } }),
	);
}

/**
 * Stub `GET /v2/agents`, used by the landing page agent grid.
 */
export async function mockAgents(page: Page, agents: Array<Record<string, unknown>> = []): Promise<void> {
	await page.route(`${API_HOST}/v2/agents**`, (route) =>
		json(route, {
			ok: true,
			data: { agents, total: agents.length, stats: null },
		}),
	);
}

/**
 * Stub the launch nonce + create endpoints used by the wizard.
 * Returns a deterministic nonce and a fake launch row on submit.
 */
export async function mockLaunchCreate(page: Page): Promise<void> {
	await page.route(`${API_HOST}/v2/launches/nonce`, (route) =>
		json(route, { ok: true, data: { nonce: "test-nonce-12345" } }),
	);
	await page.route(`${API_HOST}/v2/launches`, (route, request) => {
		if (request.method() !== "POST") return route.fallback();
		return json(route, {
			ok: true,
			data: {
				id: "launch-test-1",
				state: "open",
			},
		});
	});
}

/**
 * Stub `POST /v2/agents/provision`. Returns a fake agent provision
 * result so the wizard's success state renders without touching the
 * real provisioning pipeline.
 */
export async function mockAgentProvision(page: Page): Promise<void> {
	await page.route(`${API_HOST}/v2/agents/provision`, (route, request) => {
		if (request.method() !== "POST") return route.fallback();
		return json(route, {
			ok: true,
			data: {
				agentId: "agent-test-1",
				status: "provisioned",
			},
		});
	});
}

/**
 * Catch-all 404 for any other API endpoint the page might hit during
 * a test, so we never silently fall through to the real internet.
 *
 * Playwright evaluates the MOST-RECENTLY-registered route first, so this
 * must be installed BEFORE the specific endpoint stubs. The specific
 * mocks then take precedence; this is the safety net for anything else.
 */
export async function mockApiFallback(page: Page): Promise<void> {
	await page.route(`${API_HOST}/**`, (route) => json(route, { ok: false, error: "not-mocked" }, 404));
}

/**
 * Convenience: install the no-op defaults that most pages need.
 * Empty agents grid, empty launches list, 404 fallback for the rest.
 *
 * The fallback is registered FIRST so the more specific stubs registered
 * after it take precedence (Playwright matches routes in LIFO order).
 */
export async function installDefaultMocks(page: Page): Promise<void> {
	await mockApiFallback(page);
	await mockAgents(page, []);
	await mockLaunchesList(page, []);
	await mockPortfolio(page, []);
}

/**
 * Build a minimally valid `LaunchListItem` for fixtures.
 */
export function fakeLaunch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "launch-1",
		token: "0x0000000000000000000000000000000000000001",
		vault: "0x0000000000000000000000000000000000000002",
		creator: "0x1234567890123456789012345678901234567890",
		tier: "95",
		state: "open",
		totalDeposited: "1000000000000000000",
		bonusPool: "0",
		depositorCount: 7,
		capacity: "10000000000000000000",
		v2BuyBnb: "5000000000000000000",
		vestingEnabled: false,
		closeTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
		metadata: { name: "Test Agent", symbol: "TST", description: "an agent for tests" },
		...overrides,
	};
}
