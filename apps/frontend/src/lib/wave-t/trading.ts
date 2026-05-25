/**
 * Steward trading state for an agent's `/agent/[address]` page.
 *
 * Surfaces three slices: the active session (daily cap, expiry, policy
 * limits), open positions on the venue (e.g. Hyperliquid perps), and
 * recent orders (filled / cancelled / rejected with policy reasons).
 *
 * Data source: Steward's `/v1/trade/*` API, proxied through waifu.fun
 * api.waifu.fun (`/v2/agents/:address/trading/*`). The proxy is the
 * preferred path because:
 *
 *   1. CORS: api.waifu.fun is same-origin to the static frontend.
 *   2. Shape: the proxy flattens Steward internals into a wave-t-friendly
 *      JSON shape so the frontend never re-shapes raw Steward payloads.
 *   3. Cache: 30-60s edge cache for reads keeps the cockpit snappy.
 *   4. Auth: Steward uses bearer JWT (agent-side); the proxy serves
 *      anonymous reads to the public agent page.
 *
 * As of 2026-05-22, the proxy endpoints are not yet implemented. Sprint
 * 4 Day 5 (see `~/.moltbot/projects/sol-trading/SPRINT-4-PLAN.md`) ships
 * the backend matching this shape. Until then this module returns a
 * stable "trading not yet active" snapshot so the panel renders an
 * honest empty state instead of fixture data.
 *
 * TODO(steward-proxy): wire `/v2/agents/:address/trading/{session,positions,orders}`
 * in `apps/api` once Worker A merges PR #68 (trade-sessions) and the
 * Day 5 frontend brief assigns the proxy endpoints. The expected shape
 * is the `TradingSnapshot` exported below — the proxy SHOULD respond
 * with that shape directly so this module reduces to a single `fetch`.
 */

// Trading proxy used to be gated on `isSolAgentAddress`. Now gated on
// the presence of a `stewardAgentId` on the persona — any agent with a
// Steward session can fetch its snapshot. See `fetchTradingSnapshot`.

/** Steward session, scoped to a single venue (Hyperliquid in Phase 1). */
export type TradingSession = {
	/** Steward session id (`ses_…`). null when no session is active. */
	id: string | null;
	/** Venue this session signs against. */
	venue: "hyperliquid";
	/** Whether the session is currently active and accepting orders. */
	active: boolean;
	/**
	 * Timestamp (ms) when the session expires. The frontend renders a
	 * relative countdown ("8h 24m remaining"). null when no session.
	 */
	expiresAt: number | null;
	/** Hardcoded Phase 1 policy snapshot. */
	policy: {
		dailyCapUsd: number; // $100 in Phase 1
		dailyUsedUsd: number; // 0-N depending on fills today
		maxLeverage: number; // 2 in Phase 1
		allowedAssets: string[]; // ["BTC", "ETH"] in Phase 1
	};
};

/** Open perp position on the venue. */
export type TradingPosition = {
	/** "BTC", "ETH" — already normalized off the venue's coin id. */
	coin: string;
	side: "long" | "short";
	/** Position size in USD notional. */
	sizeUsd: number;
	/** Average entry price (USD). */
	entryPx: number;
	/** Mark price (USD). */
	markPx: number;
	/** Unrealized PnL in USD. */
	pnlUsd: number;
	/** Unrealized PnL as a percent of margin (not notional). */
	pnlPct: number;
	/** Effective leverage at current mark. */
	leverage: number;
};

/** Recent order (filled, cancelled, rejected). */
export type TradingOrder = {
	id: string;
	/** ms timestamp (creation or fill). */
	timestamp: number;
	coin: string;
	side: "long" | "short";
	/** Notional size in USD at submit. */
	sizeUsd: number;
	/** Limit / fill price (USD). 0 for unfilled rejects. */
	priceUsd: number;
	status: "filled" | "cancelled" | "rejected" | "open";
	/**
	 * When `status === "rejected"`, the policy-engine reason (e.g.
	 * `daily-cap-exceeded`, `asset-not-allowed`, `leverage-cap`).
	 * Surfaced in muted text under the row so patrons see WHY a trade
	 * was blocked.
	 */
	rejectReason?: string;
};

/** Combined snapshot shape returned by the proxy (and consumed by `<TradingPanel>`). */
export type TradingSnapshot = {
	/** True iff Steward is provisioned for this agent. */
	enabled: boolean;
	session: TradingSession | null;
	positions: TradingPosition[];
	orders: TradingOrder[];
};

const EMPTY_SNAPSHOT: TradingSnapshot = {
	enabled: false,
	session: null,
	positions: [],
	orders: [],
};

/**
 * The hardcoded Phase 1 policy. Mirrors `@stwd/policy-engine` defaults
 * for Sol's Hyperliquid session. Surfaced in the panel as "what would
 * apply if the session were active" while we wait for the live policy
 * read endpoint.
 */
const SOL_HL_POLICY: TradingSession["policy"] = {
	dailyCapUsd: 100,
	dailyUsedUsd: 0,
	maxLeverage: 2,
	allowedAssets: ["BTC", "ETH"],
};

function proxyBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

/**
 * Fetch the trading snapshot for an agent.
 *
 * Gate: presence of `stewardAgentId` on the persona. Agents without a
 * Steward session get `{ enabled: false, ... }` immediately so the panel
 * renders "trading not enabled for this agent yet". Agents with a session
 * attempt the proxy endpoint; on failure we return an honest "session
 * inactive" snapshot so the panel still shows the policy shape without
 * inventing positions.
 *
 * Server-side safe. Used from `app/agent/[address]/page.tsx`.
 */
export async function fetchTradingSnapshot(
	address: string,
	opts: { stewardAgentId?: string | null } = {},
): Promise<TradingSnapshot> {
	if (!opts.stewardAgentId) {
		return EMPTY_SNAPSHOT;
	}

	const base = proxyBase();
	try {
		const res = await fetch(`${base}/v2/agents/${address}/trading`, {
			next: { revalidate: 30 },
		});
		if (res.ok) {
			const json = (await res.json()) as unknown;
			const data =
				json && typeof json === "object" && "data" in (json as Record<string, unknown>)
					? (json as { data: unknown }).data
					: json;
			const shaped = shapeSnapshot(data);
			if (shaped) return shaped;
		}
	} catch (e) {
		// Network failure or DNS — log once at the server boundary and
		// fall through to the honest inactive snapshot below.
		console.error("trading snapshot fetch failed", e);
	}

	// Proxy unavailable (Sprint 4 Day 5 not landed yet). Return an honest
	// "trading provisioned, session not active" snapshot so the panel
	// still shows the Phase 1 policy and a zeroed cap meter. The user
	// sees the SHAPE of what will exist, never invented fills.
	return {
		enabled: true,
		session: {
			id: null,
			venue: "hyperliquid",
			active: false,
			expiresAt: null,
			policy: SOL_HL_POLICY,
		},
		positions: [],
		orders: [],
	};
}

/**
 * Defensive shape-check. The proxy may evolve and we don't want a
 * payload drift to crash the page render — we want the panel to fall
 * back to the empty state and surface "shape unexpected" to logs.
 */
function shapeSnapshot(raw: unknown): TradingSnapshot | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;

	const enabled = Boolean(r.enabled);
	const session = shapeSession(r.session);
	const positions = Array.isArray(r.positions)
		? r.positions.map(shapePosition).filter((p): p is TradingPosition => p !== null)
		: [];
	const orders = Array.isArray(r.orders) ? r.orders.map(shapeOrder).filter((o): o is TradingOrder => o !== null) : [];

	return { enabled, session, positions, orders };
}

function shapeSession(raw: unknown): TradingSession | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const policyRaw = (r.policy ?? {}) as Record<string, unknown>;
	const policy: TradingSession["policy"] = {
		dailyCapUsd: numberOr(policyRaw.dailyCapUsd, SOL_HL_POLICY.dailyCapUsd),
		dailyUsedUsd: numberOr(policyRaw.dailyUsedUsd, 0),
		maxLeverage: numberOr(policyRaw.maxLeverage, SOL_HL_POLICY.maxLeverage),
		allowedAssets: Array.isArray(policyRaw.allowedAssets)
			? policyRaw.allowedAssets.filter((a): a is string => typeof a === "string")
			: SOL_HL_POLICY.allowedAssets,
	};
	return {
		id: typeof r.id === "string" ? r.id : null,
		venue: "hyperliquid",
		active: Boolean(r.active),
		expiresAt: typeof r.expiresAt === "number" ? r.expiresAt : null,
		policy,
	};
}

function shapePosition(raw: unknown): TradingPosition | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const coin = typeof r.coin === "string" ? r.coin.toUpperCase() : null;
	if (!coin) return null;
	return {
		coin,
		side: r.side === "short" ? "short" : "long",
		sizeUsd: numberOr(r.sizeUsd, 0),
		entryPx: numberOr(r.entryPx, 0),
		markPx: numberOr(r.markPx, 0),
		pnlUsd: numberOr(r.pnlUsd, 0),
		pnlPct: numberOr(r.pnlPct, 0),
		leverage: numberOr(r.leverage, 1),
	};
}

function shapeOrder(raw: unknown): TradingOrder | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const id = typeof r.id === "string" ? r.id : null;
	const coin = typeof r.coin === "string" ? r.coin.toUpperCase() : null;
	if (!id || !coin) return null;
	const status =
		r.status === "filled" || r.status === "cancelled" || r.status === "rejected" || r.status === "open"
			? r.status
			: "filled";
	const shaped: TradingOrder = {
		id,
		timestamp: numberOr(r.timestamp, Date.now()),
		coin,
		side: r.side === "short" ? "short" : "long",
		sizeUsd: numberOr(r.sizeUsd, 0),
		priceUsd: numberOr(r.priceUsd, 0),
		status,
	};
	if (status === "rejected" && typeof r.rejectReason === "string") {
		shaped.rejectReason = r.rejectReason;
	}
	return shaped;
}

function numberOr(v: unknown, fallback: number): number {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
	return Number.isFinite(n) ? n : fallback;
}
