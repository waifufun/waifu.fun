import AgentHomeV2 from "@/components/agent-home/agent-home-v2";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { ActivityRowInput } from "@/components/agent-home/wave-t/activity-feed";
import { fetchAgentIdentity } from "@/lib/erc8004/client";
import { fetchOnchainHistory } from "@/lib/onchain-history";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { buildActivity } from "@/lib/wave-t/activity";
import { fetchAgentBurnRateSnapshot } from "@/lib/wave-t/agent-burn-rate";
import { fetchAgentHoldingsSnapshot } from "@/lib/wave-t/agent-holdings";
import { fetchAgentSafeBalance } from "@/lib/wave-t/agent-safe-balance";
import { fetchAgentOwnTrades } from "@/lib/wave-t/agent-trades";
import { fetchAgentTwitterStats } from "@/lib/wave-t/agent-twitter";
import { type App, fetchAppsForAgent } from "@/lib/wave-t/apps";
import { fetchCandleSeries } from "@/lib/wave-t/candles";
import { fetchShipLog } from "@/lib/wave-t/github";
import { type HoldingsSnapshot, fetchHoldings, holdingsSnapshotFromApi } from "@/lib/wave-t/holdings";
import { normalizeTokenAmount } from "@/lib/wave-t/normalize-amount";
import { fetchNavHistory, selectPnlBaselineNav, selectPnlSeries } from "@/lib/wave-t/pnl";
import { fetchPositions } from "@/lib/wave-t/positions";
import { type TokenMetrics, fetchTokenMetrics } from "@/lib/wave-t/token";
import { fetchTweets } from "@/lib/wave-t/voice";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
	const { isStaticExport, fetchAgentAddressesForStaticExport } = await import("@/lib/static-export-paths");
	if (!isStaticExport()) return [];
	return fetchAgentAddressesForStaticExport();
}

/** Absolute base required for SSG fetches (`/api` is invalid in Node during `next build`). */
function serverAgentApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

const API_BASE = serverAgentApiBase();
const TRADE_BASE = "https://pancakeswap.finance/swap?outputCurrency=";

function unwrapApiData<T = unknown>(payload: unknown): T {
	if (payload && typeof payload === "object" && "data" in payload) {
		return (payload as { data: T }).data;
	}
	return payload as T;
}

function mapAgentTrade(raw: Record<string, unknown>): AgentTrade {
	const timestamp =
		typeof raw.timestamp === "number"
			? raw.timestamp
			: typeof raw.timestamp === "string"
				? Date.parse(raw.timestamp)
				: typeof raw.blockTime === "string"
					? Date.parse(raw.blockTime)
					: Date.now();

	// Backend trades surface `amountIn` (quote token, BNB) and `amountOut`
	// (this agent's token) as raw wei strings. For the activity feed we
	// want the agent's token amount in human units, so prefer
	// `amountOut`/`toAmount` (buy side) and fall back to the in side.
	const rawAmount =
		(raw.type === "sell" || raw.side === "sell"
			? (raw.amount ?? raw.amountIn ?? raw.fromAmount)
			: (raw.amount ?? raw.amountOut ?? raw.toAmount)) ??
		raw.amount ??
		raw.amountOut ??
		raw.amountIn ??
		0;
	const normalized = normalizeTokenAmount(rawAmount);

	return {
		txId: String(raw.txId ?? raw.txHash ?? ""),
		type: (raw.type === "sell" || raw.side === "sell" ? "sell" : "buy") as "buy" | "sell",
		address: String(raw.address ?? raw.trader ?? raw.traderAddress ?? ""),
		amount: normalized,
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
	};
}

/**
 * Backend shape (AgentDetail) doesn't match AgentData; do the same kind of
 * mapping we do in agents-api.ts for list items, but with the extra fields
 * only the detail returns (system prompt, traits, curve).
 */
function mapAgentDetail(raw: unknown): AgentData | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const tokenAddress =
		typeof r.tokenAddress === "string" ? r.tokenAddress : typeof r.token_address === "string" ? r.token_address : "";
	if (!tokenAddress) return null;
	const name = typeof r.name === "string" ? r.name : "unknown";
	const ticker = typeof r.ticker === "string" ? r.ticker : typeof r.symbol === "string" ? r.symbol : "";
	const rawStatus = r.status;
	const status: AgentData["status"] =
		rawStatus === "graduated" ? "graduated" : rawStatus === "pending" || rawStatus === "failed" ? "pending" : "active";

	const shaped: AgentData = {
		tokenAddress,
		name,
		ticker,
		status,
		tradeUrl: `${TRADE_BASE}${tokenAddress}`,
	};
	const image = typeof r.image === "string" ? r.image : typeof r.avatarUrl === "string" ? r.avatarUrl : undefined;
	if (image) shaped.image = image;
	if (typeof r.description === "string") shaped.description = r.description;
	if (typeof r.walletAddress === "string") shaped.walletAddress = r.walletAddress;
	if (typeof r.treasuryAddress === "string") shaped.treasuryAddress = r.treasuryAddress;
	if (typeof r.preset === "string") shaped.preset = r.preset;
	if (typeof r.systemPrompt === "string") shaped.systemPrompt = r.systemPrompt;
	if (typeof r.twitterHandle === "string") shaped.twitterHandle = r.twitterHandle;
	if (Array.isArray(r.traits)) shaped.traits = r.traits.filter((t): t is string => typeof t === "string");

	const curve = r.curve as Record<string, unknown> | null | undefined;
	if (curve) {
		const bonded = curve.waifuBonded;
		const limit = curve.curveLimit;
		if (typeof bonded === "string" || typeof bonded === "number") shaped.waifuBonded = Number(bonded);
		if (typeof limit === "string" || typeof limit === "number") shaped.curveLimit = Number(limit);
		if (shaped.waifuBonded !== undefined && shaped.curveLimit !== undefined && shaped.curveLimit > 0) {
			shaped.curveProgress = Math.min(100, (shaped.waifuBonded / shaped.curveLimit) * 100);
		}
		if (typeof curve.raisedToken === "string") shaped.raisedToken = curve.raisedToken;
		if (typeof curve.pancakeswapPair === "string") {
			shaped.pancakeSwapUrl = `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}&chain=bsc`;
		}
	}

	const identity = r.identity as Record<string, unknown> | null | undefined;
	if (identity) {
		const tid = identity.eip8004TokenId;
		if (typeof tid === "string" || typeof tid === "number") shaped.eip8004TokenId = tid;
	}

	if (typeof r.framework === "string") shaped.framework = r.framework;
	if (typeof r.model === "string") shaped.model = r.model;
	if (r.lastActionAt) {
		const t = typeof r.lastActionAt === "string" ? Date.parse(r.lastActionAt) : Number(r.lastActionAt);
		if (Number.isFinite(t)) shaped.lastActionAt = t;
	}
	if (typeof r.lastActionType === "string") shaped.lastActionType = r.lastActionType;

	// persona-driven ingestion fields (added 2026-05-25 in PR #782 backend track,
	// but the mapper wasn't updated so they never reached the page render)
	if (typeof r.bioShort === "string") shaped.bioShort = r.bioShort;
	if (r.bioStyle === "first-person" || r.bioStyle === "third-person") shaped.bioStyle = r.bioStyle;
	if (Array.isArray(r.apps)) shaped.apps = r.apps as NonNullable<AgentData["apps"]>;
	if (Array.isArray(r.burn)) shaped.burn = r.burn as NonNullable<AgentData["burn"]>;
	if (typeof r.monthlyBurnUsd === "number") shaped.monthlyBurnUsd = r.monthlyBurnUsd;
	else if (typeof r.monthlyBurnUsd === "string") {
		const n = Number(r.monthlyBurnUsd);
		if (Number.isFinite(n)) shaped.monthlyBurnUsd = n;
	}
	if (r.featuredCounter && typeof r.featuredCounter === "object") {
		shaped.featuredCounter = r.featuredCounter as NonNullable<AgentData["featuredCounter"]>;
	}
	if (typeof r.featured === "boolean") shaped.featured = r.featured;
	if (typeof r.thesis === "string") shaped.thesis = r.thesis;
	if (typeof r.hlAddress === "string") shaped.hlAddress = r.hlAddress;
	if (Array.isArray(r.arbAddresses))
		shaped.arbAddresses = r.arbAddresses.filter((x): x is string => typeof x === "string");
	if (Array.isArray(r.solanaAddresses))
		shaped.solanaAddresses = r.solanaAddresses.filter((x): x is string => typeof x === "string");
	if (typeof r.stewardAgentId === "string") shaped.stewardAgentId = r.stewardAgentId;
	if (typeof r.elizaCloudAgentId === "string") shaped.elizaCloudAgentId = r.elizaCloudAgentId;
	if (typeof r.twitterPollingEnabled === "boolean") shaped.twitterPollingEnabled = r.twitterPollingEnabled;
	if (r.metadata && typeof r.metadata === "object") shaped.metadata = r.metadata as NonNullable<AgentData["metadata"]>;

	return shaped;
}

async function fetchAgent(address: string): Promise<AgentData | null> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}`, {
			next: { revalidate: 30 },
		});
		if (res.ok) {
			const mapped = mapAgentDetail(await res.json());
			if (mapped) return mapped;
		}
	} catch (e) {
		console.error("agent fetch failed", e);
	}

	// fallback: hit the legacy token endpoint and shape it into an agent
	try {
		const res = await fetch(`${API_BASE}/tokens/${address}`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const token = unwrapApiData<Record<string, unknown>>(await res.json());
		const tokenAddress =
			typeof token.contractAddress === "string"
				? token.contractAddress
				: typeof token.address === "string"
					? token.address
					: typeof token.tokenAddress === "string"
						? token.tokenAddress
						: address;
		const shaped: AgentData = {
			tokenAddress,
			name: typeof token.name === "string" ? token.name : "unknown",
			ticker: typeof token.ticker === "string" ? token.ticker : typeof token.symbol === "string" ? token.symbol : "",
			status: token.status === "migrated" || token.status === "locked" ? "graduated" : "active",
			raisedToken: "BNB",
			tradeUrl: `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`,
		};
		if (typeof token.creator === "string") shaped.walletAddress = token.creator;
		if (typeof token.creatorAddress === "string") shaped.walletAddress = token.creatorAddress;
		if (typeof token.bondingCurveAddress === "string") shaped.treasuryAddress = token.bondingCurveAddress;
		if (typeof token.poolAddress === "string") shaped.treasuryAddress = token.poolAddress;
		if (typeof token.image === "string") shaped.image = token.image;
		if (typeof token.description === "string") shaped.description = token.description;
		if (token.curveProgress !== undefined) shaped.curveProgress = Number(token.curveProgress);
		if (token.progressPercent !== undefined) shaped.curveProgress = Number(token.progressPercent);
		if (token.curveLimit !== undefined) shaped.curveLimit = Number(token.curveLimit);
		if (token.reserveAmount !== undefined) shaped.waifuBonded = Number(token.reserveAmount);
		const socials = token.socials as { twitter?: unknown } | undefined;
		if (typeof socials?.twitter === "string") {
			const handle = socials.twitter.split("/").pop()?.replace("@", "");
			if (handle) shaped.twitterHandle = handle;
		}
		if (token.pool || token.poolAddress) {
			shaped.pancakeSwapUrl = `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`;
		}
		return shaped;
	} catch (e) {
		console.error("fallback token fetch failed", e);
		return null;
	}
}

async function fetchTrades(address: string): Promise<AgentTrade[]> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}/trades`, {
			next: { revalidate: 10 },
		});
		if (res.ok) {
			const data = await res.json();
			const trades = Array.isArray(data) ? data : (data.docs ?? data.trades ?? []);
			return trades.slice(0, 20).map((t: Record<string, unknown>) => mapAgentTrade(t));
		}
	} catch (e) {
		console.error("trades fetch failed", e);
	}

	// fallback: legacy trades endpoint
	try {
		const res = await fetch(`${API_BASE}/tokens/trades`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chain: "bsc",
				chainId: 56,
				contractAddress: address,
				limit: 20,
			}),
			next: { revalidate: 10 },
		});
		if (!res.ok) return [];
		const data = unwrapApiData<Record<string, unknown> | unknown[]>(await res.json());
		const docs = Array.isArray(data) ? data : data && "docs" in data && Array.isArray(data.docs) ? data.docs : [];
		return docs.slice(0, 20).map((t) => mapAgentTrade(t as Record<string, unknown>));
	} catch (e) {
		console.error("fallback trades fetch failed", e);
		return [];
	}
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ address: string }>;
}): Promise<Metadata> {
	const { address } = await params;
	const agent = await fetchAgent(address);
	if (!agent) return { title: "agent not found" };

	const host = process.env.NEXT_PUBLIC_HOST || "https://waifu.fun";
	const title = `${agent.name} ($${agent.ticker}) · waifu.fun`;
	const description =
		agent.description ??
		"autonomous agent on waifu.fun. identity, brain, wallet, treasury. trade on pancakeswap, launched via FLAP.";
	// Per-agent OG image disabled: the nested /agent/[address]/opengraph-image
	// route inherits the wagmi/viem module graph from the app layout and 500s
	// with 'indexedDB is not defined'. Falls back to the root /opengraph-image
	// which works and still renders the brand card for shared agent pages.
	const ogUrl = `${host}/opengraph-image`;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: `${host}/agent/${agent.tokenAddress}`,
			images: [
				{
					url: ogUrl,
					width: 1200,
					height: 630,
					alt: `${agent.name} on waifu.fun`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogUrl],
		},
	};
}

/**
 * Best-effort fetch of the wave-M agent_launches row keyed by token
 * address. Returns null on 404 (legacy / non-v3 launches) or on any
 * network failure so the page degrades gracefully.
 */
async function fetchLaunch(address: string): Promise<AgentLaunchByToken | null> {
	try {
		const res = await fetch(`${API_BASE}/v2/launches/by-token/${encodeURIComponent(address.toLowerCase())}`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
			return (json as { data: AgentLaunchByToken }).data ?? null;
		}
		return json as AgentLaunchByToken;
	} catch (e) {
		console.error("launch fetch failed", e);
		return null;
	}
}

/**
 * Build the Wave T activity feed. Composes ship log (when the agent has
 * github repos wired), tweets (when twitterPolling is enabled), and
 * on-chain history into one chronological stream. Each source is
 * presence-gated on agent fields, never on identity.
 */
async function buildAgentActivity(opts: {
	tokenAddress: string;
	includeShipLog: boolean;
	includeTweets: boolean;
}): Promise<ActivityRowInput[]> {
	const [ship, tweets, onchain] = await Promise.all([
		opts.includeShipLog
			? fetchShipLog()
			: Promise.resolve({ items: [], totalMerged: 0, first: "", mergedTimestamps: [] }),
		opts.includeTweets ? fetchTweets(opts.tokenAddress) : Promise.resolve([]),
		fetchOnchainHistory({ chain: "bsc", address: opts.tokenAddress, limit: 12 }),
	]);

	const foundation = buildActivity({ prs: ship.items, tweets });

	// Map on-chain transfers into the activity feed's `tx` row variant.
	const onchainRows: ActivityRowInput[] = onchain.txs.slice(0, 12).map((tx) => ({
		id: `onchain-${tx.hash}`,
		type: "tx",
		timestamp: tx.timestamp > 0 ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
		method: tx.kind === "transfer" ? "ERC20 transfer" : tx.kind === "native" ? "BNB transfer" : tx.kind,
		valueBnb: tx.valueNative,
		url: `https://bscscan.com/tx/${tx.hash}`,
	}));

	const merged = [...foundation, ...onchainRows];
	merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	return merged;
}

function emptyTokenMetrics(address: string): TokenMetrics {
	return {
		contract: address,
		symbol: "",
		name: "",
		priceUsd: 0,
		priceBnb: 0,
		marketCap: 0,
		liquidityUsd: 0,
		holders: 0,
		volume24h: 0,
		txs24h: 0,
		change24h: 0,
		totalSupply: 0n,
	};
}

export default async function AgentPage({
	params,
}: {
	params: Promise<{ address: string }>;
}) {
	const { address } = await params;

	const agentP = fetchAgent(address);
	// Activity feed shows the agent's OWN trades (initiated by agent-safe +
	// agent-hot wallets), not all market activity on the token.
	// fetchAgentOwnTrades reads the /activity-trades endpoint which filters by
	// wallet registry; returns [] when the agent has not traded yet. Applies to
	// every agent now that the wallet registry is in place — not just Sol/the
	// architect.
	const tradesP = fetchAgentOwnTrades(address).catch(() => fetchTrades(address));
	const launchP = fetchLaunch(address);

	// Wave T data in parallel. Each fetch handles its own failures and returns
	// a sane empty default, so we never throw out of Promise.all.
	const tokenP = fetchTokenMetrics(address).catch(() => emptyTokenMetrics(address));
	const candlesP = fetchCandleSeries(address, "1h").catch(() => ({
		candles: [],
		source: "synthetic" as const,
		note: "no candle data available",
	}));
	// Holdings: prefer the aggregated /v2/agents/:address/holdings endpoint
	// (PR #712, NAV aggregator). Falls back to the legacy burner-stub when
	// the endpoint is unavailable (404 in prod today) so the donut still
	// renders something honest instead of empty.
	const aggregatedHoldingsP = fetchAgentHoldingsSnapshot(address).catch(() => null);
	const legacyHoldingsP = fetchHoldings().catch(
		() => ({ holdings: [], navUsd: 0, fetchedAt: Date.now() }) as HoldingsSnapshot,
	);
	// Burn-rate snapshot powers the hero runway readout. Null when the
	// endpoint is unavailable (404 in prod today), in which case the hero
	// renders "not yet measured" rather than inventing a number.
	const burnRateP = fetchAgentBurnRateSnapshot(address).catch(() => null);
	const twitterStatsP = fetchAgentTwitterStats(address).catch(() => null);
	const positionsP = fetchPositions().catch(() => []);
	const appsP = fetchAppsForAgent(address).catch(() => []);
	// PnL chart series. Pulled from /v2/agents/:address/nav-history; the
	// selector computes deltas relative to the first snapshot. Returns []
	// (→ empty state) when nav-history has fewer than two points. Modular:
	// any agent with nav snapshots gets a chart, anyone without gets the
	// honest "no pnl history yet" panel. No mock data.
	const navHistoryP = fetchNavHistory(address, "30d", "1h").catch(() => []);
	// ERC-8004 identity. Returns null when the agent has no on-chain
	// identity (the default for most agents). When present, the hero
	// shows a verified badge and the page renders a provenance panel.
	const identityP = fetchAgentIdentity(address).catch(() => null);

	const [
		agent,
		trades,
		launch,
		token,
		candles,
		aggregatedHoldings,
		legacyHoldings,
		burnRate,
		twitterStats,
		positions,
		apps,
		identity,
		navHistory,
	] = await Promise.all([
		agentP,
		tradesP,
		launchP,
		tokenP,
		candlesP,
		aggregatedHoldingsP,
		legacyHoldingsP,
		burnRateP,
		twitterStatsP,
		positionsP,
		appsP,
		identityP,
		navHistoryP,
	]);

	const pnlSeries = selectPnlSeries(navHistory);
	const pnlBaselineNav = selectPnlBaselineNav(navHistory);

	// Presence-based gates. Modular for any agent: persona populates these
	// fields, the page renders. No identity branches.
	//   - ship log fetch: enabled when persona.metadata.githubRepos[] is non-empty
	//   - tweet fetch: enabled when persona.twitterPollingEnabled === true
	// Architect-fixture fallback: when the DB row is absent pre-mint, the
	// fixture supplies both fields so the architect surface still renders.
	const personaMeta = (agent?.metadata as { githubRepos?: unknown } | null) ?? null;
	const githubRepos = Array.isArray(personaMeta?.githubRepos) ? personaMeta.githubRepos : [];
	const includeShipLog = githubRepos.length > 0;
	const includeTweets = agent?.twitterPollingEnabled === true;
	const activity = await buildAgentActivity({
		tokenAddress: address,
		includeShipLog,
		includeTweets,
	}).catch(() => [] as ActivityRowInput[]);

	const holdings: HoldingsSnapshot = aggregatedHoldings ? holdingsSnapshotFromApi(aggregatedHoldings) : legacyHoldings;
	const holdingsSource: "aggregated" | "burner" = aggregatedHoldings ? "aggregated" : "burner";

	// AgentSafe BNB balance fetched after the launch row resolves (it
	// supplies the safe address). Null on legacy launches or RPC blips;
	// the Hero falls back to holdings.navUsd in that case.
	const agentSafeBalance = await fetchAgentSafeBalance(launch?.agentSafe ?? null);

	if (!agent) {
		// The persona endpoint is now the source of truth. If the row is
		// missing the agent does not exist as far as the page is concerned.
		notFound();
	}

	// Merge persona-declared apps (legacy jsonb shape, kept for forward
	// compatibility) with the apps registry table. The persona endpoint
	// now returns the merged + sorted list directly; mergeAgentApps remains
	// as a safety net in case the API ever splits them again.
	const mergedApps = mergeAgentApps(agent, apps);

	return (
		<AgentHomeV2
			agent={agent}
			trades={trades}
			launch={launch}
			token={token}
			candles={candles}
			holdings={holdings}
			holdingsSource={holdingsSource}
			runwayDays={burnRate?.runwayDays ?? null}
			twitterStats={twitterStats}
			positions={positions}
			activity={activity}
			apps={mergedApps}
			agentSafeBalance={agentSafeBalance}
			identity={identity}
			pnlSeries={pnlSeries}
			pnlBaselineNav={pnlBaselineNav}
		/>
	);
}

/**
 * Merge persona-declared featured apps into the apps registry list.
 *
 * `agent.apps` (persona endpoint) typically holds platform products that
 * the agent runs (e.g. waifu.fun, steward) and want to surface as
 * featured rows. `registryApps` (from `/v2/agents/:address/apps`) holds
 * revenue-generating mini-apps from the apps registry. Both render via
 * the same `<AppsShipped>` panel; persona-featured rows sort first.
 *
 * Dedup on `slug`: if a persona row and a registry row share an `appId`,
 * the persona row's metadata wins for `featured`/`tagline` only.
 */
function mergeAgentApps(agent: AgentData, registryApps: App[]): App[] {
	const personaApps = agent.apps ?? [];
	if (personaApps.length === 0) return registryApps;

	const registryBySlug = new Map<string, App>();
	for (const app of registryApps) {
		registryBySlug.set(app.appId, app);
	}

	const merged: App[] = [];
	for (const p of personaApps) {
		const slug = p.slug ?? p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		const existing = registryBySlug.get(slug);
		const meta: Record<string, unknown> = {
			featured: true,
			...(p.tagline ? { tagline: p.tagline } : {}),
			kind: "platform-product",
		};
		if (existing) {
			merged.push({
				...existing,
				metadata: { ...((existing.metadata as Record<string, unknown> | null) ?? {}), ...meta },
			});
			registryBySlug.delete(slug);
		} else {
			merged.push({
				id: `persona-${slug}`,
				agentTokenAddress: agent.tokenAddress,
				appId: slug,
				name: p.name,
				description: p.tagline ?? null,
				icon: null,
				appUrl: p.url ?? null,
				status: p.status ?? "live",
				shippedAt: null,
				revenueLifetimeUsd: 0,
				revenue24hUsd: 0,
				revenue7dUsd: typeof p.revenueUsd === "number" ? p.revenueUsd : 0,
				revenue7dDeltaPct: null,
				metadata: meta,
				createdAt: "",
				updatedAt: "",
			});
		}
	}
	// Tail: any registry apps not also in persona
	for (const app of registryBySlug.values()) {
		merged.push(app);
	}
	return merged;
}
