/**
 * Blinks (Blockchain Links) — buy primitive for waifu.fun agent tokens.
 *
 * Returns dial.to-compatible EVM action JSON on GET and an unsigned BSC swap
 * transaction on POST. Targets the dial.to / OKX Wallet / Backpack EVM Blink
 * shape (Solana-Actions–style GET metadata, structured EVM tx in POST). NOT
 * Solana-Actions wire-compatible — Solana clients expect a base64-encoded
 * Solana transaction in the POST response, which cannot encode an EVM call.
 *
 * Empirical unfurl behavior across X / TG / Discord / Farcaster must be
 * verified before flipping `WAIFU_BLINKS_BASE_URL` in production posts.
 *
 * Paired with:
 *   - `apps/api/src/app.ts` — wildcard CORS for `/v2/agents/:token/blink`
 *     mounted before the global cors so any-origin preflight succeeds.
 *   - `apps/api/src/routes/v2/index.ts` — mounted before the agents catch-all
 *     `/:token` handler so `/agents/<addr>/blink` resolves here first.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { agentQueries, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import type { FlapClient } from "../../contracts/services.js";
import type { AppBindings } from "../../lib/bindings.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT_RE = /^[0-9]+(\.[0-9]+)?$/;

const PRESET_BNB_AMOUNTS = ["0.05", "0.1", "0.5", "1"] as const;
const PREVIEW_BNB_AMOUNT = "0.1";
const DEFAULT_SLIPPAGE_BPS = 500;
const MAX_BNB_PER_BUY = 100;

const ALLOWED_STATUSES = new Set<string>(["active", "graduated"]);

const CACHE_TTL_STABLE_SECONDS = 60;
const CACHE_TTL_NEAR_GRADUATION_SECONDS = 10;
const PROGRESS_NEAR_GRADUATION_PERCENT = 80;

const FALLBACK_ICON_URL = "https://waifu.fun/brand/icon/icon_512.png";

/** Minimal projection of `AgentDetail` used to compose Blink metadata. */
export interface BlinkAgentSnapshot {
	name: string;
	symbol: string;
	avatarUrl: string | null;
	status: string;
	curveProgressPercent: number | null;
}

export type BlinkRoutesOverrides = {
	/** Override the live flap client (tests inject a mock; production passes nothing and the handler reads `c.get("deps").flap`). */
	flap?: FlapClient;
	/** Override the agent lookup (tests pass a stub; production resolves through `getAgentByTokenAddress`). */
	getAgent?: (tokenAddress: string) => Promise<BlinkAgentSnapshot | null>;
};

function defaultRequireDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function deriveCurveProgressPercent(curve: { waifuBonded: string; curveLimit: string } | null): number | null {
	if (!curve) return null;
	const bonded = Number.parseFloat(curve.waifuBonded);
	const limit = Number.parseFloat(curve.curveLimit);
	if (!Number.isFinite(bonded) || !Number.isFinite(limit) || limit <= 0) return null;
	return Math.max(0, Math.min(100, (bonded / limit) * 100));
}

async function defaultGetAgent(tokenAddress: string): Promise<BlinkAgentSnapshot | null> {
	const db = defaultRequireDb();
	if (!db) return null;
	const detail = await agentQueries.getAgentByTokenAddress(db, tokenAddress.toLowerCase());
	if (!detail) return null;
	return {
		name: detail.name,
		symbol: detail.symbol,
		avatarUrl: detail.avatarUrl,
		status: detail.status,
		curveProgressPercent: deriveCurveProgressPercent(detail.curve),
	};
}

function formatTokenAmount(amount: string): string {
	const num = Number.parseFloat(amount);
	if (!Number.isFinite(num)) return amount;
	if (num >= 1_000) return num.toFixed(0);
	if (num >= 1) return num.toFixed(2);
	return num.toFixed(4);
}

/**
 * Compose the canonical Blink action URL, used as the base for `links.actions`
 * `href` values. Behind a TLS-terminating proxy, `c.req.url` may report `http://`
 * which Blink-aware wallets reject. Honor `WAIFU_BLINKS_PUBLIC_BASE_URL` (e.g.
 * `https://api.waifu.fun`) when set so deployments can pin the origin
 * explicitly. Falls back to forwarded-proto/host headers, then to the request
 * URL as last resort.
 */
function blinkSelfUrl(c: { req: { url: string; header: (name: string) => string | undefined } }): string {
	const overrideRaw = process.env.WAIFU_BLINKS_PUBLIC_BASE_URL?.trim();
	if (overrideRaw) {
		const u = new URL(c.req.url);
		const base = overrideRaw.replace(/\/+$/, "");
		return `${base}${u.pathname}`;
	}

	const forwardedProto = c.req.header("x-forwarded-proto");
	const forwardedHost = c.req.header("x-forwarded-host");
	const requestUrl = new URL(c.req.url);
	const proto = forwardedProto?.split(",")[0]?.trim() || requestUrl.protocol.replace(/:$/, "");
	const host = forwardedHost?.split(",")[0]?.trim() || requestUrl.host;
	return `${proto}://${host}${requestUrl.pathname}`;
}

export function createBlinkRoutes(overrides: BlinkRoutesOverrides = {}): Hono<AppBindings> {
	const app = new Hono<AppBindings>();

	// Permissive CORS at the route level. Mirrors the app.ts mount and ensures
	// that any future regression in the global cors ordering still leaves Blink
	// discovery reachable from arbitrary origins (wallets, dial.to, renderers).
	app.use(
		"/:tokenAddress/blink",
		cors({
			origin: "*",
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Content-Encoding", "Accept-Encoding"],
		}),
	);

	/**
	 * GET /v2/agents/:tokenAddress/blink
	 *
	 * Returns dial.to-compatible Blink metadata for buying the agent's token.
	 * Public — wallets and renderers fetch this from arbitrary origins.
	 */
	app.get("/:tokenAddress/blink", async (c) => {
		const token = c.req.param("tokenAddress");
		if (!ADDRESS_RE.test(token)) {
			return c.json({ error: "invalid token address" }, 400);
		}

		const getAgent = overrides.getAgent ?? defaultGetAgent;

		let agent: BlinkAgentSnapshot | null;
		try {
			agent = await getAgent(token);
		} catch (err) {
			return c.json(
				{
					error: "failed to load agent",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}

		if (!agent) {
			return c.json({ error: "agent not found" }, 404);
		}
		if (!ALLOWED_STATUSES.has(agent.status)) {
			return c.json({ error: "agent not tradable", status: agent.status }, 404);
		}

		const flap = overrides.flap ?? c.get("deps").flap;

		// Best-effort preview quote at 0.1 BNB. RPC failures (e.g. token off
		// curve, transient network) must not block Blink discovery — render
		// without the quote in that case.
		let previewOutputAmount: string | null = null;
		try {
			const quote = await flap.quoteExactInput({
				tokenAddress: token,
				side: "buy",
				amount: PREVIEW_BNB_AMOUNT,
				quoteToken: "BNB",
				slippageBps: DEFAULT_SLIPPAGE_BPS,
			});
			previewOutputAmount = quote.outputAmount;
		} catch {
			previewOutputAmount = null;
		}

		const ticker = agent.symbol.length > 0 ? agent.symbol : "TOKEN";
		const name = agent.name.length > 0 ? agent.name : "agent";
		const icon = agent.avatarUrl && agent.avatarUrl.length > 0 ? agent.avatarUrl : FALLBACK_ICON_URL;
		const selfUrl = blinkSelfUrl(c);

		const description = previewOutputAmount
			? `${name} is an autonomous agent on BSC. Buys fund her treasury via flap.sh tax routing. ~${formatTokenAmount(previewOutputAmount)} ${ticker} per ${PREVIEW_BNB_AMOUNT} BNB.`
			: `${name} is an autonomous agent on BSC. Buys fund her treasury via flap.sh tax routing.`;

		const blink = {
			type: "action" as const,
			icon,
			title: `Buy $${ticker}`,
			description,
			label: `Buy $${ticker}`,
			links: {
				actions: [
					...PRESET_BNB_AMOUNTS.map((amount) => ({
						label: `${amount} BNB`,
						href: `${selfUrl}?amount=${amount}`,
					})),
					{
						label: `Buy $${ticker}`,
						href: `${selfUrl}?amount={amount}`,
						parameters: [{ name: "amount", label: "BNB amount", required: true }],
					},
				],
			},
		};

		const ttl =
			agent.curveProgressPercent !== null && agent.curveProgressPercent > PROGRESS_NEAR_GRADUATION_PERCENT
				? CACHE_TTL_NEAR_GRADUATION_SECONDS
				: CACHE_TTL_STABLE_SECONDS;
		c.header("Cache-Control", `public, max-age=${ttl}`);

		return c.json(blink);
	});

	/**
	 * POST /v2/agents/:tokenAddress/blink?amount=<bnb>
	 *
	 * Body: `{ "account": "0x..." }`. Returns an unsigned BSC transaction
	 * encoding a flap.sh `swapExactInput` buy of the agent's token from BNB.
	 */
	app.post("/:tokenAddress/blink", async (c) => {
		const token = c.req.param("tokenAddress");
		if (!ADDRESS_RE.test(token)) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "invalid token address" }, 400);
		}

		const amountRaw = c.req.query("amount");
		if (!amountRaw || !AMOUNT_RE.test(amountRaw)) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "amount query parameter required (BNB decimal, e.g. 0.1)" }, 400);
		}
		const amountNum = Number.parseFloat(amountRaw);
		if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > MAX_BNB_PER_BUY) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: `amount must be > 0 and <= ${MAX_BNB_PER_BUY} BNB` }, 400);
		}

		let body: { account?: unknown };
		try {
			body = (await c.req.json()) as { account?: unknown };
		} catch {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const account = typeof body.account === "string" ? body.account : "";
		if (!ADDRESS_RE.test(account)) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "body.account must be a valid EVM address" }, 400);
		}

		const flap = overrides.flap ?? c.get("deps").flap;
		const chainId = c.get("deps").config.chain.chainId;

		let prepared: Awaited<ReturnType<FlapClient["prepareSwap"]>>;
		try {
			prepared = await flap.prepareSwap({
				tokenAddress: token,
				side: "buy",
				amount: amountRaw,
				quoteToken: "BNB",
				slippageBps: DEFAULT_SLIPPAGE_BPS,
				traderAddress: account,
			});
		} catch (err) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "failed to prepare swap",
					detail: err instanceof Error ? err.message : String(err),
				},
				502,
			);
		}

		const calldata = prepared.call.calldata;
		if (!calldata) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "swap calldata unavailable" }, 502);
		}

		// Best-effort ticker lookup for the human-readable message line. Failure
		// here is non-fatal — the tx itself is still returned.
		const getAgent = overrides.getAgent ?? defaultGetAgent;
		const agentSnap = await getAgent(token).catch(() => null);
		const ticker = agentSnap?.symbol && agentSnap.symbol.length > 0 ? agentSnap.symbol : "TOKEN";

		c.header("Cache-Control", "no-store");
		return c.json({
			type: "transaction" as const,
			transaction: {
				to: prepared.call.contractAddress,
				data: calldata,
				value: prepared.call.value,
				chainId,
			},
			message: `Buy ~${formatTokenAmount(prepared.quote.outputAmount)} ${ticker} for ${amountRaw} BNB`,
		});
	});

	return app;
}

export default createBlinkRoutes();
