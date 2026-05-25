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

import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";

import { agentPersonas, agentWalletRegistry, getDatabase } from "@waifufun/db";

const app = new Hono();
const HL_BASE_URL = "https://api.hyperliquid.xyz";

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

type HlState = {
	marginSummary?: { accountValue?: string | number };
	crossMarginSummary?: { accountValue?: string | number };
	withdrawable?: string | number;
	assetPositions?: Array<{ position?: HlPosition }>;
	time?: number;
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
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const agentId = c.req.param("agentId");

	const resolved = await resolveHyperliquidWallet(db, agentId);
	if (!resolved) return c.json({ wallet: null, accountValueUsd: 0, positions: [], ts: Date.now() });

	const [state, mids] = await Promise.all([
		postInfo<HlState>({ type: "clearinghouseState", user: resolved.address }),
		postInfo<Record<string, string>>({ type: "allMids" }),
	]);

	const accountValue = num(state?.marginSummary?.accountValue) ?? num(state?.crossMarginSummary?.accountValue) ?? 0;
	const withdrawable = num(state?.withdrawable) ?? 0;

	const positions = (state?.assetPositions ?? [])
		.map(({ position }) => position)
		.filter((p): p is HlPosition => Boolean(p?.coin))
		.map((pos) => {
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
			};
		})
		.filter((p): p is NonNullable<typeof p> => p !== null);

	return c.json({
		wallet: resolved.address,
		accountValueUsd: accountValue,
		withdrawableUsd: withdrawable,
		positions,
		ts: Date.now(),
	});
});

export default app;
