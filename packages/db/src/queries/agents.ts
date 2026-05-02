import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import { agentEvents } from "../schema/agent-events.js";
import { type AgentPersonaRow, agentPersonas } from "../schema/agent-personas.js";
import { type AgentWalletRow, agentWallets } from "../schema/agent-wallets.js";
import { curveState } from "../schema/curve-state.js";
import { tokens } from "../schema/tokens.js";
import { trades } from "../schema/trades.js";

export type AgentApiStatus = "active" | "graduated" | "failed" | "pending";

export interface AgentListFilters {
	limit: number;
	offset: number;
	status?: AgentApiStatus | undefined;
	includeLegacy?: boolean | undefined;
	ownerAddress?: string | undefined;
	ownerStewardUserId?: string | undefined;
}

export interface AgentCurveSummary {
	waifuBonded: string;
	curveLimit: string;
	isGraduated: boolean;
	raisedToken: string;
	status: string;
	offers: string;
	funds: string;
	lastPrice: string | null;
	pancakeswapPair: string | null;
	graduatedAt: string | null;
}

export interface AgentIdentitySummary {
	eip8004TokenId: string;
	contractAddress: string;
	txHash?: string;
	agentURI?: string;
}

export interface AgentPublicState {
	brainPaused: boolean;
	withdrawalsPaused: boolean;
	killed: boolean;
	killedAt: string | null;
}

export interface AgentSummary {
	agentId: string;
	name: string;
	symbol: string;
	description: string;
	avatarUrl: string | null;
	tokenAddress: string | null;
	walletAddress: string;
	treasuryAddress: string | null;
	preset: string | null;
	twitterHandle: string | null;
	status: AgentApiStatus;
	curve: AgentCurveSummary | null;
	identity: AgentIdentitySummary | null;
	state: AgentPublicState;
	framework: string;
	model: string;
	lastActionAt: string | null;
	lastActionType: string | null;
	createdAt: string;
}

export interface AgentDetail extends AgentSummary {
	systemPrompt: string | null;
	traits: string[];
	trades24hCount: number;
}

export interface AgentListResult {
	agents: AgentSummary[];
	total: number;
	limit: number;
	offset: number;
}

/**
 * Canonical BSC addresses used to pretty-print `raised_token` on the API.
 * Anything else falls back to the lowercased address string.
 */
const WBNB_BSC_MAINNET = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const WBNB_BSC_TESTNET = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
const USDT_BSC_MAINNET = "0x55d398326f99059ff775485246999027b3197955";

function prettyRaisedToken(raw: string | null): string {
	if (!raw || raw.length === 0) return "BNB";
	const lower = raw.toLowerCase();
	if (lower === WBNB_BSC_MAINNET || lower === WBNB_BSC_TESTNET) return "BNB";
	if (lower === USDT_BSC_MAINNET) return "USDT";
	return lower;
}

/**
 * Derive the API-facing status from persona + curve_state rows.
 *
 *   pending    — token not deployed yet (no token_address)
 *   graduated  — curve state says is_graduated
 *   failed     — curve status is HALT (four.meme manually halted)
 *   active     — everything else
 */
function deriveStatus(
	tokenAddress: string | null,
	curveRow: { status: string; isGraduated: boolean } | null,
): AgentApiStatus {
	if (!tokenAddress) return "pending";
	if (!curveRow) return "active";
	if (curveRow.isGraduated) return "graduated";
	if (curveRow.status.toUpperCase() === "HALT") return "failed";
	return "active";
}

interface JoinRow {
	persona: AgentPersonaRow;
	wallet: AgentWalletRow | null;
	curve: typeof curveState.$inferSelect | null;
	token: { ticker: string; description: string | null; imageUrl: string | null } | null;
}

function toSummary(row: JoinRow): AgentSummary {
	const persona = row.persona;
	const wallet = row.wallet;
	const curve = row.curve;
	const token = row.token;

	const tokenAddress = (persona.tokenAddress ?? wallet?.agentToken ?? null) as string | null;
	const status = deriveStatus(tokenAddress, curve ? { status: curve.status, isGraduated: curve.isGraduated } : null);

	const treasuryAddress = wallet?.safeAddress ?? null;
	const walletAddress = wallet?.walletAddress ?? "";

	const curveSummary: AgentCurveSummary | null = curve
		? {
				waifuBonded: curve.waifuBonded,
				curveLimit: curve.curveLimit,
				isGraduated: curve.isGraduated,
				raisedToken: prettyRaisedToken(curve.raisedToken),
				status: curve.status,
				offers: curve.offers,
				funds: curve.funds,
				lastPrice: curve.lastPrice ?? null,
				pancakeswapPair: curve.pancakeswapPair ? curve.pancakeswapPair.toLowerCase() : null,
				graduatedAt: curve.graduatedAt ? curve.graduatedAt.toISOString() : null,
			}
		: null;

	const identity = extractIdentity(persona.metadata);
	const state: AgentPublicState = {
		brainPaused: persona.brainPausedAt !== null,
		withdrawalsPaused: persona.withdrawalsPausedAt !== null,
		killed: persona.killedAt !== null,
		killedAt: persona.killedAt ? persona.killedAt.toISOString() : null,
	};

	return {
		agentId: persona.agentId,
		name: persona.name,
		symbol: token?.ticker ?? "",
		description: persona.bio ?? token?.description ?? "",
		avatarUrl: persona.avatarUrl ?? token?.imageUrl ?? null,
		tokenAddress: tokenAddress ? tokenAddress.toLowerCase() : null,
		walletAddress: walletAddress.toLowerCase(),
		treasuryAddress: treasuryAddress ? treasuryAddress.toLowerCase() : null,
		preset: persona.preset ?? null,
		twitterHandle: persona.twitterHandle ?? null,
		status,
		curve: curveSummary,
		identity,
		state,
		framework: "ElizaOS",
		model: "Cloud",
		lastActionAt: null,
		lastActionType: null,
		createdAt: persona.createdAt.toISOString(),
	};
}

/**
 * Pull identity { eip8004TokenId, contractAddress, … } out of persona metadata
 * JSON, if present. Returns null if the shape isn't there.
 */
function extractIdentity(metadata: unknown): AgentIdentitySummary | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
	const maybe = (metadata as Record<string, unknown>).identity;
	if (!maybe || typeof maybe !== "object" || Array.isArray(maybe)) return null;
	const id = maybe as Record<string, unknown>;
	const token = id.eip8004TokenId;
	const contract = id.contractAddress;
	if (typeof token !== "string" || typeof contract !== "string") return null;
	const out: AgentIdentitySummary = {
		eip8004TokenId: token,
		contractAddress: contract,
	};
	if (typeof id.txHash === "string") out.txHash = id.txHash;
	if (typeof id.agentURI === "string") out.agentURI = id.agentURI;
	return out;
}

/**
 * List agents ordered by most recent creation. Joins persona (primary) ← wallet
 * ← curve_state.
 */
export async function listAgents(db: Database, filters: AgentListFilters): Promise<AgentListResult> {
	const limit = Math.min(Math.max(filters.limit, 1), 100);
	const offset = Math.max(filters.offset, 0);

	// We can't push "derived status" into the DB filter cleanly (it's computed
	// across two nullable join rows), so we over-fetch when a status filter is
	// present and re-filter in-memory. That's fine for the MVP — total agent
	// counts are small. If this list grows past ~10k rows we should promote
	// `status` onto the persona row.
	// Only surface agents whose launch has actually gone on-chain. Agents in
	// 'prepared' (waiting for a human patron to claim the URL) or 'claimed'
	// (claimed but not yet broadcast) aren't real tokens yet, so they don't
	// belong in the public directory. Legacy rows (pre-0007 migration) with
	// NULL agent_launch_status but a non-null token_address are surfaced
	// under the 'token_address IS NOT NULL' clause as a fallback.
	const ownerPredicates = [];
	if (filters.ownerStewardUserId) {
		ownerPredicates.push(eq(agentPersonas.ownerStewardUserId, filters.ownerStewardUserId));
	}
	if (filters.ownerAddress) {
		ownerPredicates.push(sql`lower(${agentPersonas.ownerAddress}) = lower(${filters.ownerAddress})`);
	}

	const ownerFilter =
		ownerPredicates.length === 0
			? sql`true`
			: ownerPredicates.length === 1
				? ownerPredicates[0]
				: sql`(${ownerPredicates[0]} OR ${ownerPredicates[1]})`;

	const baseRows = await db
		.select({
			persona: agentPersonas,
			wallet: agentWallets,
			curve: curveState,
			tokenTicker: tokens.ticker,
			tokenDescription: tokens.description,
			tokenImageUrl: tokens.imageUrl,
		})
		.from(agentPersonas)
		.leftJoin(agentWallets, eq(agentWallets.internalAgentId, agentPersonas.agentId))
		.leftJoin(curveState, sql`lower(${curveState.agentToken}) = lower(${agentPersonas.tokenAddress})`)
		.leftJoin(tokens, sql`lower(${tokens.contractAddress}) = lower(${agentPersonas.tokenAddress})`)
		.where(
			and(
				sql`(${agentPersonas.agentLaunchStatus} = 'launched' OR ${agentPersonas.tokenAddress} IS NOT NULL)`,
				filters.includeLegacy ? sql`true` : eq(agentPersonas.legacyV1, false),
				ownerFilter,
			),
		)
		.orderBy(desc(agentPersonas.createdAt));

	const mapped = baseRows.map((row) =>
		toSummary({
			persona: row.persona,
			wallet: row.wallet,
			curve: row.curve,
			token: row.tokenTicker
				? {
						ticker: row.tokenTicker,
						description: row.tokenDescription,
						imageUrl: row.tokenImageUrl,
					}
				: null,
		}),
	);

	const filtered = filters.status ? mapped.filter((row) => row.status === filters.status) : mapped;

	const total = filtered.length;
	const page = filtered.slice(offset, offset + limit);

	// Hydrate lastAction for the paginated slice only (cheap batch query).
	const hydrated = await hydrateLastActions(db, page);

	return { agents: hydrated, total, limit, offset };
}

/**
 * For each agent summary, look up the most recent `agent_events` row where
 * `status='done'` and attach `lastActionAt` + `lastActionType`. This is the
 * ambient "alive pulse" surfaced on the discovery grid and agent home.
 *
 * Done in one query that scans agent_events filtered by agent_id IN (...).
 * If there are lots of agents, this will grow — promote to a materialized
 * view later.
 */
async function hydrateLastActions<T extends AgentSummary>(db: Database, items: T[]): Promise<T[]> {
	if (items.length === 0) return items;
	const agentIds = items.map((a) => a.agentId);

	const rows = await db
		.select({
			agentId: agentEvents.agentId,
			eventType: agentEvents.eventType,
			createdAt: agentEvents.createdAt,
		})
		.from(agentEvents)
		.where(and(inArray(agentEvents.agentId, agentIds), eq(agentEvents.status, "done")))
		.orderBy(desc(agentEvents.createdAt));

	// Walk once; keep the first (=newest) row per agentId.
	const latest = new Map<string, { eventType: string; createdAt: Date }>();
	for (const r of rows) {
		if (!r.agentId) continue;
		if (!latest.has(r.agentId)) {
			latest.set(r.agentId, { eventType: r.eventType, createdAt: r.createdAt });
		}
	}

	return items.map((item) => {
		const hit = latest.get(item.agentId);
		if (!hit) return item;
		return {
			...item,
			lastActionAt: hit.createdAt.toISOString(),
			lastActionType: humanizeEventType(hit.eventType),
		};
	});
}

/**
 * Map a canonical agent_events.event_type (`token.purchased`, `agent.graduated`, ...)
 * to a short verb suitable for UI: "trade", "call", "post", "ship", "decide".
 * Keep the mapping liberal — we never want the UI to say something ugly.
 */
function humanizeEventType(t: string): string {
	if (t === "token.purchased" || t === "token.sold" || t.startsWith("agent.trade")) {
		return "trade";
	}
	if (t.startsWith("x.") || t.startsWith("agent.tweet") || t.startsWith("agent.post")) {
		return "post";
	}
	if (t.startsWith("agent.call")) return "call";
	if (t.startsWith("agent.ship")) return "ship";
	if (t.startsWith("agent.decide") || t.startsWith("agent.choice")) return "decide";
	if (t === "token.created" || t === "agent.created") return "mint";
	if (t === "agent.graduated") return "graduate";
	if (t === "agent.prepared" || t === "agent.claimed" || t === "agent.launched") return "launch";
	if (t.startsWith("tax.") || t.startsWith("treasury.")) return "treasury";
	if (t.startsWith("credits.") || t.startsWith("inference.")) return "spend";
	return "action";
}

/**
 * Look up an agent by on-chain token address. Returns `null` if no agent
 * is linked to that token yet.
 */
export async function getAgentByTokenAddress(db: Database, tokenAddress: string): Promise<AgentDetail | null> {
	const lower = tokenAddress.toLowerCase();

	const [row] = await db
		.select({
			persona: agentPersonas,
			wallet: agentWallets,
			curve: curveState,
			tokenTicker: tokens.ticker,
			tokenDescription: tokens.description,
			tokenImageUrl: tokens.imageUrl,
		})
		.from(agentPersonas)
		.leftJoin(agentWallets, eq(agentWallets.internalAgentId, agentPersonas.agentId))
		.leftJoin(curveState, sql`lower(${curveState.agentToken}) = lower(${agentPersonas.tokenAddress})`)
		.leftJoin(tokens, sql`lower(${tokens.contractAddress}) = lower(${agentPersonas.tokenAddress})`)
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${lower}`)
		.limit(1);

	if (!row) return null;

	const baseSummary = toSummary({
		persona: row.persona,
		wallet: row.wallet,
		curve: row.curve,
		token: row.tokenTicker
			? {
					ticker: row.tokenTicker,
					description: row.tokenDescription,
					imageUrl: row.tokenImageUrl,
				}
			: null,
	});
	const [summary] = await hydrateLastActions(db, [baseSummary]);

	// Trades in the last 24h
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const [countRow] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(trades)
		.where(and(sql`lower(${trades.tokenAddress}) = ${lower}`, gte(trades.blockTimestamp, since)));

	const traits = Array.isArray(row.persona.traits)
		? row.persona.traits.filter((t): t is string => typeof t === "string")
		: [];

	// hydrateLastActions always returns an array of the same length; summary
	// is guaranteed defined here (we just passed one item in), but appease TS.
	const hydrated = summary ?? baseSummary;

	return {
		...hydrated,
		systemPrompt: row.persona.systemPrompt ?? null,
		traits,
		trades24hCount: countRow?.count ?? 0,
	};
}

export interface AgentTradeRecord {
	type: "buy" | "sell";
	trader: string;
	amountIn: string;
	amountOut: string;
	price: string | null;
	txHash: string;
	blockNumber: number;
	blockTime: string;
}

export async function listAgentTrades(db: Database, tokenAddress: string, limit = 50): Promise<AgentTradeRecord[]> {
	const lower = tokenAddress.toLowerCase();
	const cappedLimit = Math.min(Math.max(limit, 1), 200);

	const rows = await db
		.select({
			side: trades.side,
			traderAddress: trades.traderAddress,
			amountIn: trades.amountIn,
			amountOut: trades.amountOut,
			price: trades.price,
			txHash: trades.txHash,
			blockNumber: trades.blockNumber,
			blockTimestamp: trades.blockTimestamp,
		})
		.from(trades)
		.where(sql`lower(${trades.tokenAddress}) = ${lower}`)
		.orderBy(desc(trades.blockTimestamp))
		.limit(cappedLimit);

	return rows.map((r) => ({
		type: r.side,
		trader: r.traderAddress.toLowerCase(),
		amountIn: r.amountIn,
		amountOut: r.amountOut,
		price: r.price ?? null,
		txHash: r.txHash,
		blockNumber: Number(r.blockNumber),
		blockTime: r.blockTimestamp.toISOString(),
	}));
}
