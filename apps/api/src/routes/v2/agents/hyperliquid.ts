/**
 * Live Hyperliquid positions for an agent.
 *
 * Returns positions + current mark prices + unrealized PnL so the
 * frontend doesn't have to talk to Hyperliquid directly from the
 * browser (CORS + rate-limit fan-out concerns).
 *
 * GET /v2/agents/:agentId/hyperliquid/positions
 *
 * Response shape:
 *   {
 *     wallet: "0x...",
 *     accountValueUsd: 996.19,
 *     withdrawableUsd: 996.19,
 *     positions: [
 *       {
 *         coin, side, size, entryPrice, currentPrice, leverage,
 *         notionalUsd, marginUsd, liquidationPrice,
 *         unrealizedPnlUsd, unrealizedPnlPct, roe
 *       }
 *     ],
 *     ts: 1234567890
 *   }
 */

import { and, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { agentPersonas, agentWalletRegistry, feeDistributions, getDatabase } from "@waifufun/db";

import { configuredBuilderDexs, fetchAllHlState } from "../../../services/hyperliquid/builder-dexs.js";
import { type HlWindow, buildHlPnl } from "../../../services/hyperliquid/pnl.js";

const app = new Hono();
const HL_BASE_URL = "https://api.hyperliquid.xyz";

const HL_WINDOWS = new Set<HlWindow>(["day", "week", "month", "allTime"]);

/**
 * Known PRIOR (abandoned) Hyperliquid wallets, keyed by current token
 * address. These are not in `agent_wallet_registry` (they were retired
 * before the registry existed) but still hold real, closed trade history
 * that must count toward lifetime stats. Add entries as agents rotate
 * wallets.
 */
const PRIOR_HL_WALLETS: Record<string, string[]> = {
	// sol-the-architect: previous HL wallet (rotated away, +$951 realized). Kept in
	// the P&L aggregation so the card reflects the agent's FULL trading history,
	// current wallet + prior wallets combined.
	"0x15fc6086064afe50ccf4c70000c55cecb6e17777": ["0x30641cd7c2e0997acbd8789b86ade9b381da048b"],
};

function priorWalletsFor(tokenAddress: string): string[] {
	return PRIOR_HL_WALLETS[tokenAddress.toLowerCase()] ?? [];
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

type HlPosition = {
	coin?: string;
	szi?: string | number;
	entryPx?: string | number;
	unrealizedPnl?: string | number;
	liquidationPx?: string | number | null;
	leverage?: { value?: string | number; type?: string } | string | number;
	positionValue?: string | number;
	returnOnEquity?: string | number;
	marginUsed?: string | number;
};

function num(value: unknown, fallback: number | null = null): number | null {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function leverageVal(value: HlPosition["leverage"]): number | null {
	if (typeof value === "object" && value) return num(value.value);
	return num(value);
}

async function postInfo<T>(body: unknown): Promise<T | null> {
	try {
		const res = await fetch(`${HL_BASE_URL}/info`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

async function resolveAgentTokenAddress(
	db: NonNullable<ReturnType<typeof requireDb>>,
	agentId: string,
): Promise<string | null> {
	const [persona] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(or(eq(agentPersonas.agentId, agentId), eq(agentPersonas.tokenAddress, agentId.toLowerCase())))
		.limit(1);
	return persona?.tokenAddress ?? (agentId.startsWith("0x") ? agentId.toLowerCase() : null);
}

async function resolveHyperliquidWallet(
	db: NonNullable<ReturnType<typeof requireDb>>,
	agentId: string,
): Promise<{ address: string; agentTokenAddress: string } | null> {
	// Resolve `agentId` to a token address via the persona table.
	const [persona] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress, internalAgentId: agentPersonas.agentId })
		.from(agentPersonas)
		.where(or(eq(agentPersonas.agentId, agentId), eq(agentPersonas.tokenAddress, agentId.toLowerCase())))
		.limit(1);
	const tokenAddress = persona?.tokenAddress ?? agentId.toLowerCase();
	if (!tokenAddress) return null;

	const [wallet] = await db
		.select({ address: agentWalletRegistry.address })
		.from(agentWalletRegistry)
		.where(and(eq(agentWalletRegistry.agentTokenAddress, tokenAddress), eq(agentWalletRegistry.venue, "hyperliquid")))
		.limit(1);
	if (!wallet) return null;
	return { address: wallet.address, agentTokenAddress: tokenAddress };
}

app.get("/:agentId/hyperliquid/positions", async (c) => {
	// Live-polled (5s) by the agent page; never serve a cached snapshot or the
	// positions panel looks frozen. Mirrors the events feed cache policy.
	c.header("Cache-Control", "no-store");
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const agentId = c.req.param("agentId");

	const resolved = await resolveHyperliquidWallet(db, agentId);
	if (!resolved) return c.json({ wallet: null, accountValueUsd: 0, positions: [], ts: Date.now() });

	// HIP-3 builder-dex mids are dex-scoped; the core allMids payload does NOT
	// contain builder markets (e.g. xyz:SPCX). Fetch core + each configured
	// builder dex's mids and merge so builder positions get a mark price (and
	// thus liquidation-distance) instead of null. Builder allMids keys are
	// dex-prefixed (xyz:SPCX), matching pos.coin.
	const builderDexs = configuredBuilderDexs();
	const [state, coreMids, ...builderMids] = await Promise.all([
		fetchAllHlState(resolved.address),
		postInfo<Record<string, string>>({ type: "allMids" }),
		...builderDexs.map((dex) =>
			postInfo<Record<string, string>>({ type: "allMids", dex }).catch(() => ({}) as Record<string, string>),
		),
	]);
	const mids: Record<string, string> = Object.assign(
		{},
		coreMids ?? {},
		...builderMids.map((m) => m ?? {}),
	);

	const positions = state.mergedPositions
		.filter((entry): entry is { position: HlPosition; dex?: string; builderPerp?: boolean } =>
			Boolean(entry.position?.coin),
		)
		.map(({ position: pos, dex, builderPerp }) => {
			const szi = num(pos.szi) ?? 0;
			if (szi === 0) return null;
			const entryPx = num(pos.entryPx);
			const lev = leverageVal(pos.leverage);
			const positionValue = num(pos.positionValue) ?? Math.abs(szi) * (entryPx ?? 0);
			const margin = num(pos.marginUsed) ?? (lev ? positionValue / lev : positionValue);
			const currentPrice = mids?.[pos.coin ?? ""] ? Number(mids[pos.coin ?? ""]) : null;
			const unrealized = num(pos.unrealizedPnl) ?? 0;
			const unrealizedPct = margin > 0 ? (unrealized / margin) * 100 : null;
			return {
				coin: pos.coin,
				side: szi > 0 ? "long" : "short",
				size: Math.abs(szi),
				entryPrice: entryPx,
				currentPrice,
				leverage: lev,
				notionalUsd: positionValue,
				marginUsd: margin,
				liquidationPrice: num(pos.liquidationPx),
				unrealizedPnlUsd: unrealized,
				unrealizedPnlPct: unrealizedPct,
				roe: num(pos.returnOnEquity),
				dex,
				builderPerp: builderPerp || undefined,
			};
		})
		.filter((p): p is NonNullable<typeof p> => p !== null);

	return c.json({
		wallet: resolved.address,
		accountValueUsd: state.totalAccountValue,
		withdrawableUsd: state.totalWithdrawable,
		positions,
		ts: Date.now(),
	});
});

/**
 * Deposit-EXCLUDED Hyperliquid trading PnL for an agent.
 *
 * GET /v2/agents/:agentId/hyperliquid/pnl?window=day|week|month|allTime
 *
 * The old chart did `pnl = nav[i] - nav[0]`, folding deposits straight
 * into pnl (a $2k deposit looked like +$2k profit). This route uses HL's
 * own `pnlHistory` (deposit-adjusted) for the series + lifetime totals,
 * anchors the baseline at first real activity, and aggregates any prior
 * (abandoned) wallets into lifetime stats. Tax income is reported by the
 * separate /tax-income route and is NEVER summed into trading pnl.
 *
 * Response shape:
 *   {
 *     wallet, priorWallets, window,
 *     series: [{ t, pnl }],                       // deposit-excluded, baseline-anchored
 *     tradingPnl: { realized, unrealized, builderDexUnrealized, total, currentWallet, priorWallets },
 *     accountValue, withdrawable,
 *     winLoss: { wins, losses } | null,
 *     taxIncome: { amountWei, source },           // SEPARATE stream, not in tradingPnl
 *     ts
 *   }
 */
app.get("/:agentId/hyperliquid/pnl", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const agentId = c.req.param("agentId");

	const windowParam = (c.req.query("window") ?? "allTime") as HlWindow;
	const window: HlWindow = HL_WINDOWS.has(windowParam) ? windowParam : "allTime";

	const resolved = await resolveHyperliquidWallet(db, agentId);
	if (!resolved) {
		return c.json({
			wallet: null,
			priorWallets: [],
			window,
			series: [],
			tradingPnl: { realized: 0, unrealized: 0, builderDexUnrealized: 0, total: 0, currentWallet: 0, priorWallets: 0 },
			accountValue: 0,
			withdrawable: 0,
			winLoss: null,
			taxIncome: { amountWei: "0", source: "fee_distributions.agent_share" },
			ts: Date.now(),
		});
	}

	const priorWallets = priorWalletsFor(resolved.agentTokenAddress);

	const [pnl, taxRow] = await Promise.all([
		buildHlPnl(resolved.address, priorWallets, window),
		db
			.select({ amountWei: sql<string>`COALESCE(SUM(${feeDistributions.agentShare}), 0)::text` })
			.from(feeDistributions)
			.where(eq(feeDistributions.agentToken, resolved.agentTokenAddress))
			.then((rows) => rows[0]),
	]);

	return c.json({
		...pnl,
		// tax income is its OWN stat, never folded into tradingPnl.
		taxIncome: {
			amountWei: taxRow?.amountWei ?? "0",
			source: "fee_distributions.agent_share",
		},
	});
});

/**
 * Agent tax-stream income (platform fee revenue routed to the agent).
 *
 * GET /v2/agents/:agentId/tax-income
 *
 * Sum of `fee_distributions.agent_share` (raw wei, numeric(78,0)) for the
 * agent's token. This is a SEPARATE income stream from trading pnl and
 * must never be mixed into it. Currently can be $0 (no distributions yet)
 * but the wiring is correct so it lights up the moment fees flow.
 */
app.get("/:agentId/tax-income", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const agentId = c.req.param("agentId");

	const tokenAddress = await resolveAgentTokenAddress(db, agentId);
	if (!tokenAddress) {
		return c.json({ token: null, amountWei: "0", count: 0, source: "fee_distributions.agent_share", ts: Date.now() });
	}

	const [row] = await db
		.select({
			amountWei: sql<string>`COALESCE(SUM(${feeDistributions.agentShare}), 0)::text`,
			count: sql<number>`COUNT(*)::int`,
		})
		.from(feeDistributions)
		.where(eq(feeDistributions.agentToken, tokenAddress));

	return c.json({
		token: tokenAddress,
		amountWei: row?.amountWei ?? "0",
		count: row?.count ?? 0,
		source: "fee_distributions.agent_share",
		ts: Date.now(),
	});
});

export default app;
