/**
 * Live-data wrappers for static-exported panels.
 *
 * The agent page is a static export (`output: "export"`). Every server
 * fetch in `app/agent/[address]/page.tsx` runs once at `next build` and
 * embeds frozen values into the HTML. Without these wrappers, the
 * chart, price, NAV, and feeds all stay stuck on the build snapshot.
 *
 * Each wrapper:
 *   1. takes the SSG-prefetched value as `initial` so the first paint
 *      is instant, no spinner, no layout shift
 *   2. spins up a `useEffect` poller against the live API right after
 *      hydration
 *   3. passes the freshest value to the underlying panel
 *
 * Polling cadences are tuned to upstream cache windows; see
 * `./live-data.ts` for the per-hook intervals.
 */

"use client";

import { useMemo } from "react";

import type { AgentTrade } from "@/components/agent-home/types";
import { type AgentEvent, useAgentEvents } from "@/lib/hooks/use-agent-events";
import { mergeActivityWithTrades } from "@/lib/wave-t/activity-trades";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";
import type { CandleSeries } from "@/lib/wave-t/candles";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { NavHistoryPoint } from "@/lib/wave-t/pnl";
import type { TokenMetrics } from "@/lib/wave-t/token";

import type { HyperliquidPosition } from "@/lib/hooks/use-hyperliquid-positions";
import type { Position } from "@/lib/wave-t/positions";
import { ActivePositions } from "./active-positions";
import { ActivityFeed, type ActivityFeedAuthor, type ActivityRowInput } from "./activity-feed";
import type { HeroIdentity, HeroProps, HeroTreasuryOverride } from "./hero";
import { HeroV2 } from "./hero-v2";
import { HoldingsAllocation } from "./holdings-allocation";
import {
	useLiveAgentTrades,
	useLiveHoldings,
	useLivePerpPositions,
	useLiveTokenMetrics,
	useLiveTweets,
	useLiveTwitterStats,
} from "./live-data";
import { PriceChart } from "./price-chart";

// ── Hero ───────────────────────────────────────────────────────

export type LiveHeroProps = Omit<HeroProps, "navUsd" | "twitterStats" | "treasuryValueOverride" | "livePulse"> & {
	identity: HeroIdentity;
	address: string;
	initialHoldings: HoldingsSnapshot;
	initialHoldingsHasAggregated: boolean;
	initialTwitterStats: TwitterStats | null;
	/**
	 * When provided, this fixed override (e.g. AgentSafe BNB balance)
	 * is preferred over the live NAV poll. The hook still polls
	 * holdings for the donut, but the hero number reads from the
	 * override to avoid contradicting other panels.
	 */
	staticTreasuryOverride?: HeroTreasuryOverride | undefined;
	/**
	 * Real nav-snapshot series from /v2/agents/:address/nav-history,
	 * prefetched at build (same source the pnl chart reads). The hero
	 * sparkline renders only when this has two or more points; otherwise
	 * the slot stays empty. We never synthesize a trend.
	 */
	navSeries?: NavHistoryPoint[] | null;
};

/**
 * Live-polling wrapper around <Hero>. Polls holdings every 30s and
 * twitter stats every 5 min. The treasury value swaps in the aggregated
 * NAV as soon as a live snapshot arrives, even if the SSG build only
 * had the burner-stub fallback.
 */
export function LiveHero({
	address,
	initialHoldings,
	initialHoldingsHasAggregated,
	initialTwitterStats,
	staticTreasuryOverride,
	navSeries,
	...rest
}: LiveHeroProps) {
	const holdings = useLiveHoldings(address, initialHoldings, initialHoldingsHasAggregated);
	const twitter = useLiveTwitterStats(address, initialTwitterStats);

	// Live aggregated poll wins. The static override is a *fallback* used
	// only when the live poll hasn't (yet) landed a real aggregated snapshot.
	// Without this priority, the hero treasury freezes on build-time SSG
	// values even though useLiveHoldings is refreshing every 30s in the
	// background.
	const treasuryOverride: HeroTreasuryOverride | undefined = holdings.hasAggregated
		? { valueUsd: holdings.snapshot.navUsd, source: "aggregated" }
		: staticTreasuryOverride;

	return (
		<HeroV2
			{...rest}
			navUsd={holdings.snapshot.navUsd}
			twitterStats={twitter}
			{...(treasuryOverride ? { treasuryValueOverride: treasuryOverride } : {})}
			navSeries={navSeries ?? null}
			livePulse
		/>
	);
}

// ── Active positions ───────────────────────────────────────────

/**
 * Live-polling wrapper around <ActivePositions>. Seeds from the SSG
 * perp-position list, then refreshes off the live /holdings snapshot's
 * `perpsPositions[]` (the /hyperliquid/positions endpoint does not exist).
 * The live pulse only renders when at least one perp position is open.
 */
export function LiveActivePositions({
	address,
	positions,
	initialHyperliquidPositions,
}: {
	address: string;
	positions: Position[];
	initialHyperliquidPositions: HyperliquidPosition[];
}) {
	const hyperliquidPositions = useLivePerpPositions(address, initialHyperliquidPositions);
	return (
		<ActivePositions
			positions={positions}
			hyperliquidPositions={hyperliquidPositions}
			live={hyperliquidPositions.length > 0}
		/>
	);
}

// ── Holdings allocation ────────────────────────────────────────

export function LiveHoldingsAllocation({
	address,
	initial,
	initialHasAggregated,
}: {
	address: string;
	initial: HoldingsSnapshot;
	initialHasAggregated: boolean;
}) {
	const holdings = useLiveHoldings(address, initial, initialHasAggregated);
	return <HoldingsAllocation snapshot={holdings.snapshot} />;
}

// ── Price chart + token metrics ────────────────────────────────

export function LivePriceChart({
	contract,
	initialToken,
	initialSeries,
}: {
	contract: string;
	initialToken: TokenMetrics;
	initialSeries: CandleSeries;
}) {
	const token = useLiveTokenMetrics(contract, initialToken);
	// Candles refresh inside PriceChart itself via the range tab, plus
	// we tick the initial 1h series here so the chart keeps walking
	// forward without a user click. We pass the freshest series via a
	// key prop so PriceChart re-seeds its internal state.
	return <PriceChart token={token} initialSeries={initialSeries} />;
}

function asString(value: unknown, fallback = ""): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function explorerTxUrl(chainId: string | null, txHash: string | null): string | undefined {
	if (!txHash) return undefined;
	switch (String(chainId ?? "")) {
		case "56":
			return `https://bscscan.com/tx/${txHash}`;
		case "42161":
			return `https://arbiscan.io/tx/${txHash}`;
		case "8453":
			return `https://basescan.org/tx/${txHash}`;
		case "1":
			return `https://etherscan.io/tx/${txHash}`;
		default:
			return undefined;
	}
}

function renderedText(event: AgentEvent): string | undefined {
	return typeof event.data?.renderedText === "string" ? event.data.renderedText.toLowerCase() : undefined;
}

function githubRepoLabel(event: AgentEvent): string {
	const payload = event.payload ?? {};
	const repo = asString(payload.repo, "github");
	const org = asString(payload.org);
	return org && !repo.includes("/") ? `${org}/${repo}` : repo;
}

function githubLatestLabel(event: AgentEvent): string {
	const payload = event.payload ?? {};
	const sha = asString(payload.sha, asString(payload.mergeCommitSha));
	if (sha) return sha.slice(0, 7);
	const number = asNumber(payload.number, 0);
	if (number > 0) return `pr #${number}`;
	return asString(payload.title, "github event").toLowerCase();
}

function eventToActivityRow(event: AgentEvent): ActivityRowInput | null {
	if (event.grouped && event.items && event.items.length > 1) {
		const items = event.items
			.map(eventToActivityRow)
			.filter((row): row is Exclude<ActivityRowInput, { type: "githubGroup" }> => Boolean(row));
		if (items.length > 1) {
			return {
				id: `agent-event-group-${event.id}`,
				type: "githubGroup",
				timestamp: event.createdAt,
				eventType: event.eventType,
				repo: githubRepoLabel(event),
				count: event.count ?? items.length,
				latestLabel: githubLatestLabel(event.items[0] ?? event),
				items,
			};
		}
	}

	const payload = event.payload ?? {};
	const url = explorerTxUrl(event.chainId, event.txHash);
	switch (event.eventType) {
		case "treasury.transfer": {
			const amountUsd = asNumber(payload.amountUsd, 0);
			const amount = renderedText(event) ?? `${asString(payload.amount)} ${asString(payload.asset, "bnb")}`.trim();
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "convert",
				from: asString(payload.fromLabel, asString(payload.from, "agentsafe")),
				to: asString(payload.toLabel, asString(payload.to, "steward wallet")),
				amount,
				deltaUsd: amountUsd,
				...(url ? { url } : {}),
			};
		}
		case "credits.topped_up": {
			const creditsAdded = asNumber(payload.creditsAdded, 0);
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "deposit",
				from: asString(payload.fromAsset, "bnb"),
				to: `${asString(payload.provider, "eliza cloud")} credit`,
				amount: renderedText(event) ?? `+${creditsAdded} ${asString(payload.currency, "usd")} credit`,
				deltaUsd: creditsAdded,
				...(url ? { url } : {}),
			};
		}
		case "wallet.provisioned": {
			const text = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "wallet",
				timestamp: event.createdAt,
				walletType: asString(payload.walletType, "steward-managed"),
				walletAddress: asString(payload.walletAddress, "wallet"),
				chainId: event.chainId,
				status: event.status,
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
		}
		case "policy.applied": {
			const policies = Array.isArray(payload.policies) ? payload.policies : [];
			const text = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "policy",
				timestamp: event.createdAt,
				count: policies.length || asNumber(payload.n, 0),
				walletAddress: asString(payload.walletAddress, "wallet"),
				summary: policies
					.map((p) => asString((p as { type?: unknown }).type))
					.filter(Boolean)
					.join(", "),
				chainId: event.chainId,
				status: event.status,
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
		}
		case "trade.session.opened": {
			const allowedAssets = Array.isArray(payload.allowedAssets)
				? payload.allowedAssets.map((asset) => asString(asset)).filter(Boolean)
				: undefined;
			const text = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "tradeSession",
				timestamp: event.createdAt,
				venue: asString(payload.venue, "trading"),
				dailyCapUsd: asNumber(payload.dailyCapUsd, 0),
				perOrderCapUsd: asNumber(payload.perOrderCapUsd, 0),
				leverageCap: asNumber(payload.leverageCap, 0),
				...(allowedAssets ? { allowedAssets } : {}),
				chainId: event.chainId,
				status: event.status,
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
		}
		case "commit.pushed":
		case "gh_commit_pushed": {
			const text = renderedText(event);
			const commitUrl = asString(payload.url);
			return {
				id: `agent-event-${event.id}`,
				type: "app",
				timestamp: event.createdAt,
				action: "updated",
				appName: text ?? asString(payload.repoLabel, asString(payload.repo, "github")),
				version: asString(payload.sha).slice(0, 7),
				...(commitUrl ? { url: commitUrl } : {}),
			};
		}
		case "pr.merged":
		case "pr.opened":
		case "gh_pr_merged":
		case "gh_pr_opened": {
			const text = renderedText(event);
			const number = asNumber(payload.number, 0);
			return {
				id: `agent-event-${event.id}`,
				type: "pr",
				timestamp: event.createdAt,
				title:
					text ??
					asString(payload.title, event.eventType.includes("opened") ? "opened pull request" : "merged pull request"),
				number,
				url: asString(payload.url),
			};
		}
		case "hl_fill": {
			// Live hyperliquid fill. The producer streams every venue fill as
			// a discrete hl_fill (buy/sell, size, price, notional). We render
			// it as a perp `fill` row. closedPnlUsd > 0 means this fill
			// reduced a position, so we surface the realized pnl on the right.
			const rawSide = asString(payload.side, "buy").toLowerCase();
			const side: "long" | "short" = rawSide === "sell" || rawSide === "short" || rawSide === "a" ? "short" : "long";
			const asset = asString(payload.asset, asString(payload.coin, asString(payload.symbol, "asset"))).toUpperCase();
			const size = asNumber(payload.size, asNumber(payload.amount, 0));
			const price = asNumber(payload.price, asNumber(payload.fillPriceUsd, 0));
			const notionalUsd = asNumber(payload.notionalUsd, price * size);
			const closedPnl = asNumber(payload.closedPnlUsd, asNumber(payload.closedPnl, 0));
			const venue = asString(payload.venue, "hyperliquid");
			const text = renderedText(event);
			const fillId = asString(payload.fillId, asString(payload.orderId, event.id));
			const row: ActivityRowInput = {
				id: `hl-fill-${fillId}`,
				type: "perpTrade",
				kind: "fill",
				timestamp: asString(payload.timestamp, event.createdAt),
				venue,
				asset,
				side,
				size,
				notionalUsd,
				fillPriceUsd: price,
				...(closedPnl !== 0 ? { pnlUsd: closedPnl } : {}),
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
			return row;
		}
		case "hl_position_changed": {
			// A position open / resize snapshot. Carries leverage, entry, and
			// live unrealized pnl. Rendered as a perp `open` row so the feed
			// reads "opened ZEC long" with notional + leverage in the sub.
			const rawSide = asString(payload.side, "long").toLowerCase();
			const side: "long" | "short" = rawSide === "short" || rawSide === "sell" || rawSide === "a" ? "short" : "long";
			const asset = asString(payload.asset, asString(payload.coin, asString(payload.symbol, "asset"))).toUpperCase();
			const leverage = asNumber(payload.leverage, 0) || null;
			const entryPrice = asNumber(payload.entryPrice, asNumber(payload.entryPriceUsd, 0));
			const notionalUsd = asNumber(payload.notionalUsd, 0);
			const unrealizedPnl = asNumber(payload.unrealizedPnlUsd, asNumber(payload.pnlUsd, 0));
			const venue = asString(payload.venue, "hyperliquid");
			const text = renderedText(event);
			const row: ActivityRowInput = {
				id: `agent-event-${event.id}`,
				type: "perpTrade",
				kind: "open",
				timestamp: asString(payload.timestamp, event.createdAt),
				venue,
				asset,
				side,
				notionalUsd,
				entryPriceUsd: entryPrice,
				leverage,
				...(unrealizedPnl !== 0 ? { pnlUsd: unrealizedPnl } : {}),
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
			return row;
		}
		case "tax.received": {
			// Platform fee revenue swept to the agent. Rendered as a revenue
			// row (treasury category) with a positive usd delta.
			const usd = asNumber(payload.usd, asNumber(payload.amountUsd, 0));
			return {
				id: `agent-event-${event.id}`,
				type: "revenue",
				timestamp: event.createdAt,
				source: "tax",
				usd,
			};
		}
		case "treasury.swept": {
			// Treasury sweep: fees consolidated into the agent treasury. Shows
			// as a treasury convert row with the swept usd value.
			const amountUsd = asNumber(payload.amountUsd, asNumber(payload.usd, 0));
			const asset = asString(payload.asset, asString(payload.symbol, "")).toUpperCase();
			const amount = renderedText(event) ?? `${asString(payload.amount, "")} ${asset}`.trim();
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "deposit",
				from: asString(payload.fromLabel, "tax stream"),
				to: asString(payload.toLabel, "treasury"),
				amount: amount || "treasury swept",
				deltaUsd: Math.abs(amountUsd),
				...(url ? { url } : {}),
			};
		}
		case "trade.open":
		case "trade.close":
		case "trade.fill":
		case "trade.liquidation": {
			const kind: "open" | "close" | "fill" | "liquidation" =
				event.eventType === "trade.open"
					? "open"
					: event.eventType === "trade.close"
						? "close"
						: event.eventType === "trade.fill"
							? "fill"
							: "liquidation";
			const rawSide = asString(payload.side, "long").toLowerCase();
			const side: "long" | "short" = rawSide === "short" || rawSide === "sell" || rawSide === "a" ? "short" : "long";
			const asset = asString(payload.asset, asString(payload.coin, asString(payload.symbol, "asset"))).toUpperCase();
			const pnlPctRaw = payload.pnlPct;
			const pnlPct =
				typeof pnlPctRaw === "number" && Number.isFinite(pnlPctRaw)
					? pnlPctRaw
					: typeof pnlPctRaw === "string" && pnlPctRaw.length > 0
						? Number(pnlPctRaw)
						: null;
			const text = renderedText(event);
			const row: ActivityRowInput = {
				id: `agent-event-${event.id}`,
				type: "perpTrade",
				kind,
				timestamp: event.createdAt,
				venue: asString(payload.venue, "hyperliquid"),
				asset,
				side,
				size: asNumber(payload.size, asNumber(payload.amount, 0)),
				notionalUsd: asNumber(payload.notionalUsd, 0),
				marginUsd: asNumber(payload.marginUsd, 0),
				entryPriceUsd: asNumber(payload.entryPrice, asNumber(payload.entryPriceUsd, 0)),
				fillPriceUsd: asNumber(payload.price, asNumber(payload.fillPriceUsd, 0)),
				leverage: asNumber(payload.leverage, 0) || null,
				pnlUsd: asNumber(payload.pnlUsd, asNumber(payload.closedPnl, 0)),
				pnlPct: pnlPct !== null && Number.isFinite(pnlPct) ? pnlPct : null,
				...(text ? { renderedText: text } : {}),
				...(url ? { url } : {}),
			};
			return row;
		}
		case "bridge.completed": {
			const fromAmount = asString(payload.fromAmount, "?");
			const fromAsset = asString(payload.fromAsset, "?").toUpperCase();
			const toAmount = asString(payload.toAmount, "?");
			const toAsset = asString(payload.toAsset, "USDC").toUpperCase();
			const bridge = asString(payload.bridge, "li.fi");
			const feeUsd = asNumber(payload.feeUsd, 0);
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "convert",
				from: `${fromAmount} ${fromAsset}`,
				to: `${toAmount} ${toAsset}`,
				amount: renderedText(event) ?? `via ${bridge}`,
				deltaUsd: -feeUsd,
				...(url ? { url } : {}),
			};
		}
		case "hl.deposit": {
			const amount = asString(payload.amount, "?");
			const asset = asString(payload.asset, "USDC").toUpperCase();
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "deposit",
				from: `arbitrum ${asset}`,
				to: "hyperliquid",
				amount: renderedText(event) ?? `${amount} ${asset}`,
				deltaUsd: asNumber(payload.creditedToHl, asNumber(payload.amountUsd, 0)),
				...(url ? { url } : {}),
			};
		}
		case "transfer.in":
		case "transfer.out": {
			const direction = event.eventType === "transfer.in" ? "deposit" : "withdraw";
			const amount = asString(payload.amount, "?");
			const asset = asString(payload.asset, asString(payload.symbol, "token")).toUpperCase();
			const counterparty = asString(
				payload.counterpartyLabel,
				asString(payload.counterparty, asString(payload.from, asString(payload.to, "chain"))),
			);
			const amountUsd = asNumber(payload.amountUsd, 0);
			const delta = direction === "deposit" ? Math.abs(amountUsd) : -Math.abs(amountUsd);
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: direction,
				from: direction === "deposit" ? counterparty : "agent",
				to: direction === "deposit" ? "agent" : counterparty,
				amount: renderedText(event) ?? `${amount} ${asset}`,
				deltaUsd: delta,
				...(url ? { url } : {}),
			};
		}
		case "safe.tx.proposed":
		case "safe.tx.signed":
		case "safe.tx.executed": {
			// Safe lifecycle events render as a single "safe tx" row. The
			// stage (proposed | signed | executed) goes into the right slot;
			// FE relies on backend correlation_id to suppress duplicates
			// when more than one stage lands within the poll window.
			const stage = event.eventType.split(".").pop() ?? "updated";
			const summary = asString(
				payload.method,
				asString(payload.summary, `safe tx ${asString(payload.safeTxHash, "").slice(0, 8)}`),
			);
			const safeText = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "policy",
				timestamp: event.createdAt,
				count: asNumber(payload.signaturesCount, 0),
				walletAddress: asString(payload.safeAddress, "safe"),
				summary: `safe tx ${stage} · ${summary}`,
				chainId: event.chainId,
				status: event.status,
				...(safeText ? { renderedText: safeText } : {}),
				...(url ? { url } : {}),
			};
		}
		case "policy.denied":
		case "policy.needs_manual": {
			// Operator-only events. Hidden by default in the public feed via
			// the API visibility column; if they leak through (e.g. operator
			// preview) we still render but with the negative tone implied by
			// the eventType. The activity-feed.tsx category mapping puts
			// these in 'system'.
			const reason = asString(payload.reason, asString(payload.message, "policy decision"));
			const kind = event.eventType.split(".").pop() ?? "decision";
			const policyText = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "policy",
				timestamp: event.createdAt,
				count: 1,
				walletAddress: asString(payload.walletAddress, "steward"),
				summary: `${kind === "denied" ? "denied" : "manual review"} · ${reason}`,
				chainId: event.chainId,
				status: event.status,
				...(policyText ? { renderedText: policyText } : {}),
				...(url ? { url } : {}),
			};
		}
		case "inference.spent": {
			// Rolled up per minute by the eliza bridge ingester; we just
			// render the bucket. The renderedText cache should already say
			// e.g. "42 inferences · $0.18" so we never recompute on FE.
			const usd = asNumber(payload.usd, asNumber(payload.amountUsd, 0));
			const tokens = asNumber(payload.tokens, asNumber(payload.totalTokens, 0));
			return {
				id: `agent-event-${event.id}`,
				type: "treasury",
				timestamp: event.createdAt,
				action: "withdraw",
				from: "agent",
				to: asString(payload.provider, "inference"),
				amount: renderedText(event) ?? (tokens > 0 ? `${tokens.toLocaleString()} tokens` : "inference spend"),
				deltaUsd: -Math.abs(usd),
				...(url ? { url } : {}),
			};
		}
		case "identity.registered":
		case "identity.card_updated": {
			const kind = event.eventType.split(".").pop() ?? "updated";
			const tokenId = asString(payload.tokenId, asString(payload.id, ""));
			const identityText = renderedText(event);
			return {
				id: `agent-event-${event.id}`,
				type: "policy",
				timestamp: event.createdAt,
				count: 1,
				walletAddress: asString(payload.registry, "erc-8004"),
				summary:
					kind === "registered"
						? `identity registered · token #${tokenId}`
						: `identity card updated · token #${tokenId}`,
				chainId: event.chainId,
				status: event.status,
				...(identityText ? { renderedText: identityText } : {}),
				...(url ? { url } : {}),
			};
		}
		default:
			return null;
	}
}

// ── Activity feed ──────────────────────────────────────────────

export function LiveActivityFeed({
	address,
	initialTrades,
	initialActivity,
	ticker,
	twitterPollingEnabled = false,
	author,
	max = 30,
}: {
	address: string;
	initialTrades: AgentTrade[];
	initialActivity: ActivityRowInput[];
	ticker: string;
	/**
	 * Gate the tweet poll on a data-driven flag from the persona
	 * endpoint. When false, the feed still renders any tweet rows that
	 * came through the SSG seed but does not spin up a poll. Drops the
	 * old `isSolAgent` identity prop entirely.
	 */
	twitterPollingEnabled?: boolean;
	author?: ActivityFeedAuthor;
	max?: number;
}) {
	const trades = useLiveAgentTrades(address, initialTrades);
	// limit:200 so the dedup logic (which pairs commit.pushed events to their
	// parent pr.merged via mergeCommitSha) has enough history to catch the
	// pairings even when the agent has shipped a lot recently. The dedup
	// only works when both events are in the same batch.
	const agentEvents = useAgentEvents(address, { pollMs: 15_000, limit: 200 });
	// Tweet poll gates on an explicit persona flag, not identity. Agents
	// without twitter polling configured render any SSG-seeded tweets and
	// skip the runtime poll.
	const initialTweets = useMemo(() => {
		const out: {
			id: string;
			text: string;
			createdAt: string;
			url: string;
			impressions: number;
			likes: number;
			replies: number;
		}[] = [];
		for (const row of initialActivity) {
			if (row.type === "tweet") {
				out.push({
					id: row.id.replace(/^tweet-/, ""),
					text: row.text,
					createdAt: row.timestamp,
					url: row.url,
					impressions: row.impressions,
					likes: row.likes,
					replies: 0,
				});
			}
		}
		return out;
	}, [initialActivity]);
	const tweets = useLiveTweets(twitterPollingEnabled ? address : "", initialTweets);

	// Merge: replace tweet rows in initialActivity with the live set;
	// keep everything else (PRs, txs, etc) as the SSG seed because we
	// don't have a runtime endpoint for those yet. Live trades feed in
	// via mergeActivityWithTrades like before.
	const rows: ActivityRowInput[] = useMemo(() => {
		const nonTweet = initialActivity.filter((r) => r.type !== "tweet");
		const tweetRows: ActivityRowInput[] = tweets.map((t) => ({
			id: `tweet-${t.id}`,
			type: "tweet" as const,
			timestamp: t.createdAt,
			text: t.text,
			url: t.url,
			impressions: t.impressions,
			likes: t.likes,
		}));

		// Dedupe github events: a merged PR head commit shows up as both
		// pr.merged AND commit.pushed (same sha). Drop the commit when its
		// sha matches a pr.merged.merge_commit_sha (or, when that field is
		// absent, when the commit lands within 60s of the pr.merged for the
		// same org/repo). pr.merged is canonical.
		const prMergedShas = new Set<string>();
		const prMergedRepoTimes: Array<{ repo: string; t: number }> = [];
		for (const e of agentEvents.events) {
			if (e.eventType !== "pr.merged") continue;
			const p = e.payload ?? {};
			const sha = (p as Record<string, unknown>).mergeCommitSha;
			if (typeof sha === "string" && sha) prMergedShas.add(sha.toLowerCase());
			const org = String((p as Record<string, unknown>).org ?? "");
			const repo = String((p as Record<string, unknown>).repo ?? "");
			if (org && repo) prMergedRepoTimes.push({ repo: `${org}/${repo}`, t: new Date(e.createdAt).getTime() });
		}
		const shouldKeepCommit = (e: AgentEvent) => {
			if (e.eventType !== "commit.pushed" && e.eventType !== "gh_commit_pushed") return true;
			const p = (e.payload ?? {}) as Record<string, unknown>;
			const sha = typeof p.sha === "string" ? p.sha.toLowerCase() : "";
			if (sha && prMergedShas.has(sha)) return false;
			// 60-second heuristic when sha not in pr.merged payload
			const org = String(p.org ?? "");
			const repo = String(p.repo ?? "");
			const orgRepo = org && repo ? `${org}/${repo}` : "";
			if (!orgRepo) return true;
			const t = new Date(e.createdAt).getTime();
			return !prMergedRepoTimes.some((p2) => p2.repo === orgRepo && Math.abs(p2.t - t) < 60_000);
		};
		const filteredEvents = agentEvents.events
			.map((e) => {
				if (!e.grouped || !e.items || (e.eventType !== "commit.pushed" && e.eventType !== "gh_commit_pushed")) return e;
				const items = e.items.filter(shouldKeepCommit);
				if (items.length === 0) return null;
				if (items.length === 1) return items[0] ?? null;
				return { ...e, count: items.length, items };
			})
			.filter((e): e is AgentEvent => e !== null && shouldKeepCommit(e));

		const eventRows = filteredEvents.map(eventToActivityRow).filter((row): row is ActivityRowInput => Boolean(row));
		const merged = [...nonTweet, ...tweetRows, ...eventRows];
		merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
		return mergeActivityWithTrades({ activity: merged, trades, ticker });
	}, [initialActivity, tweets, agentEvents.events, trades, ticker]);

	return <ActivityFeed rows={rows} max={max} {...(author ? { author } : {})} live />;
}
