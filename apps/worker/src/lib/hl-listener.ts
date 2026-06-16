/**
 * Hyperliquid trade listener.
 *
 * Polls every `pollIntervalMs` (default 10s):
 *
 * 1. `userFillsByTime` for each registered HL wallet -> emits `trade.fill` /
 *    `trade.liquidation` events into `agent_events`, idempotent on
 *    Hyperliquid's per-fill `tid` (also exposed as `fillId`).
 * 2. `userFunding` for each wallet -> emits `hl_funding` events, idempotent
 *    on wallet/coin/time so hourly funding backfills can be replayed safely.
 * 3. `clearinghouseState` for each wallet -> diffs `assetPositions`
 *    against the last in-memory snapshot to emit `trade.open` /
 *    `trade.close` events that summarise net position changes.
 *
 * Why poll instead of websocket?
 *  - HL's public ws is reliable but adds a long-lived connection
 *    we'd need to babysit (reconnect, backoff, multi-account fan-out).
 *  - 10s polling on a single agent costs 6 req/min per endpoint --
 *    well under HL's rate-limit envelope (1200 req/min per IP).
 *  - Idempotency via `tid` means a polled fill that arrives twice is
 *    a no-op insert, so we can crank polling up without dup risk.
 *
 * If we later need sub-second latency (liquidations, fast scalps) we
 * can swap the same emit path behind a websocket subscriber without
 * touching the FE.
 */

import { and, desc, eq, gte, isNull, or } from "drizzle-orm";

import { agentEvents, agentPersonas, agentWalletRegistry, renderEventData, tradeRationales } from "@waifufun/db";

import type { WorkerContext } from "./types.js";

const HL_BASE_URL = "https://api.hyperliquid.xyz";
const ARBITRUM_CHAIN_ID = "42161";
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_TICK_WATCHDOG_MS = 60_000;
const DEFAULT_FILLS_BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_FUNDING_BACKFILL_WINDOW_MS = 4 * 24 * 60 * 60 * 1000; // 4d, bounded one-shot recovery
const MAX_FILLS_BACKFILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUNDING_BACKFILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CURSOR_FUTURE_SKEW_MS = 5 * 60 * 1000;
const TRADE_RATIONALE_LOOKBACK_MS = 30 * 60 * 1000;

export type HyperliquidFill = {
	coin?: string;
	px?: string;
	sz?: string;
	side?: "B" | "A";
	time?: number;
	startPosition?: string;
	dir?: string; // e.g. "Open Long", "Close Long", "Liquidated Cross Long"
	closedPnl?: string;
	hash?: string;
	oid?: number;
	crossed?: boolean;
	fee?: string;
	feeToken?: string;
	tid?: number;
	liquidation?: { liquidatedUser?: string; markPx?: string };
};

export type HyperliquidFundingDelta = {
	type?: string;
	coin?: string;
	fundingRate?: string | number;
	szi?: string | number;
	usdc?: string | number;
	nSamples?: number | null;
};

export type HyperliquidFunding = HyperliquidFundingDelta & {
	time?: number;
	hash?: string;
	delta?: HyperliquidFundingDelta;
};

type HyperliquidPosition = {
	coin?: string;
	szi?: string | number;
	entryPx?: string | number;
	unrealizedPnl?: string | number;
	liquidationPx?: string | number | null;
	leverage?: { value?: string | number } | string | number;
	positionValue?: string | number;
	returnOnEquity?: string | number;
};

type HyperliquidClearinghouseState = {
	marginSummary?: { accountValue?: string | number };
	crossMarginSummary?: { accountValue?: string | number };
	withdrawable?: string | number;
	assetPositions?: Array<{ position?: HyperliquidPosition }>;
	time?: number;
};

export type PositionSnapshot = {
	coin: string;
	szi: number;
	entryPx: number | null;
	leverage: number | null;
};

type WalletTarget = {
	walletId: string;
	address: string;
	agentTokenAddress: string;
	agentId: string | null;
};

type WalletTickMetrics = {
	fillsFetched: number;
	fillsSkipped: number;
	fillsEmitted: number;
	fundingFetched: number;
	fundingSkipped: number;
	fundingEmitted: number;
	positionEventsEmitted: number;
};

type TickMetrics = WalletTickMetrics & {
	walletsPolled: number;
	walletsFailed: number;
	durationMs: number;
};

export interface HyperliquidListenerOptions {
	pollIntervalMs?: number;
	fillsBackfillWindowMs?: number;
	fundingBackfillWindowMs?: number;
	requestTimeoutMs?: number;
	tickWatchdogMs?: number;
	builderDexs?: string[];
	fetch?: typeof fetch;
	baseUrl?: string;
}

type HyperliquidDexScope = {
	dex: string | null;
	label: string;
};

interface ListenerHandle {
	stop: () => Promise<void>;
}

function emptyWalletMetrics(): WalletTickMetrics {
	return {
		fillsFetched: 0,
		fillsSkipped: 0,
		fillsEmitted: 0,
		fundingFetched: 0,
		fundingSkipped: 0,
		fundingEmitted: 0,
		positionEventsEmitted: 0,
	};
}

function addWalletMetrics(target: WalletTickMetrics, delta: WalletTickMetrics): void {
	target.fillsFetched += delta.fillsFetched;
	target.fillsSkipped += delta.fillsSkipped;
	target.fillsEmitted += delta.fillsEmitted;
	target.fundingFetched += delta.fundingFetched;
	target.fundingSkipped += delta.fundingSkipped;
	target.fundingEmitted += delta.fundingEmitted;
	target.positionEventsEmitted += delta.positionEventsEmitted;
}

function errorDetails(err: unknown): Record<string, unknown> {
	if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
	return { message: String(err) };
}

function boundedWindow(value: number | undefined, fallback: number, max: number): number {
	if (!Number.isFinite(value) || value === undefined || value <= 0) return fallback;
	return Math.min(value, max);
}

export function configuredBuilderDexs(envValue = process.env.HL_BUILDER_DEXS): string[] {
	if (envValue !== undefined) {
		return envValue
			.split(",")
			.map((dex) => dex.trim())
			.filter((dex, index, all) => dex.length > 0 && all.indexOf(dex) === index);
	}
	return ["xyz"];
}

function hyperliquidDexScopes(builderDexs?: string[]): HyperliquidDexScope[] {
	const configured = builderDexs ?? configuredBuilderDexs();
	const deduped = configured
		.map((dex) => dex.trim())
		.filter((dex, index, all) => dex.length > 0 && all.indexOf(dex) === index);
	return [{ dex: null, label: "core" }, ...deduped.map((dex) => ({ dex, label: dex }))];
}

function scopedInfoBody(body: Record<string, unknown>, scope: HyperliquidDexScope): Record<string, unknown> {
	return scope.dex ? { ...body, dex: scope.dex } : body;
}

function scopedSourceEventId(prefix: string, scope: HyperliquidDexScope, id: string | number): string {
	return scope.dex ? `${prefix}:${scope.dex}:${id}` : `${prefix}:${id}`;
}

function normalizeBuilderCoin(coin: string, scope: HyperliquidDexScope): string {
	if (!scope.dex) return coin;
	return coin.includes(":") ? coin : `${scope.dex}:${coin}`;
}

function scopeMatchesCoin(scope: HyperliquidDexScope, coin: string | undefined): boolean {
	if (!scope.dex) return !coin?.includes(":");
	return coin?.toLowerCase().startsWith(`${scope.dex.toLowerCase()}:`) ?? false;
}

function preferScopedFill(
	current: { scope: HyperliquidDexScope; fill: HyperliquidFill },
	candidate: { scope: HyperliquidDexScope; fill: HyperliquidFill },
): { scope: HyperliquidDexScope; fill: HyperliquidFill } {
	const currentMatches = scopeMatchesCoin(current.scope, current.fill.coin);
	const candidateMatches = scopeMatchesCoin(candidate.scope, candidate.fill.coin);
	if (candidateMatches && !currentMatches) return candidate;
	if (candidate.scope.dex && !current.scope.dex && candidate.fill.coin?.includes(":")) return candidate;
	return current;
}

function numberOr(value: unknown, fallback: number | null = null): number | null {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function leverageValue(value: HyperliquidPosition["leverage"]): number | null {
	if (typeof value === "object" && value) return numberOr(value.value);
	return numberOr(value);
}

function sideFromSzi(szi: number): "long" | "short" {
	return szi >= 0 ? "long" : "short";
}

function formatUsd(value: number): string {
	const abs = Math.abs(value);
	const body =
		abs >= 1000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : abs.toFixed(2);
	return `${value < 0 ? "-" : ""}$${body}`;
}

function signedUsd(value: number): string {
	if (!Number.isFinite(value)) return "$0.00";
	const sign = value > 0 ? "+" : value < 0 ? "" : "";
	return `${sign}${formatUsd(value)}`;
}

function precisionForAsset(asset: string): number {
	const u = asset.toUpperCase();
	if (u === "BTC") return 5;
	if (u === "ETH") return 4;
	if (u === "SOL") return 3;
	if (u === "BNB") return 3;
	return 4;
}

function formatSize(asset: string, size: number): string {
	const precision = precisionForAsset(asset);
	return size.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: precision,
	});
}

export function renderFill(fill: HyperliquidFill): string {
	const coin = (fill.coin ?? "").toLowerCase();
	const side = fill.side === "B" ? "buy" : fill.side === "A" ? "sell" : "fill";
	const sz = numberOr(fill.sz) ?? 0;
	const px = numberOr(fill.px) ?? 0;
	return `filled ${side} ${formatSize(coin || "asset", sz)} ${coin} at ${formatUsd(px)}`;
}

export function renderLiquidation(fill: HyperliquidFill): string {
	const coin = (fill.coin ?? "").toLowerCase();
	const px = numberOr(fill.px) ?? 0;
	const sideHint = (fill.dir ?? "").toLowerCase().includes("short") ? "short" : "long";
	return `🚨 liquidated ${coin} ${sideHint} at ${formatUsd(px)} (margin call)`;
}

export function renderOpen(snap: PositionSnapshot, notionalUsd: number): string {
	const side = sideFromSzi(snap.szi);
	const entry = snap.entryPx ?? 0;
	const lev = snap.leverage ? `${snap.leverage}x ` : "";
	return `opened ${snap.coin.toLowerCase()} ${side} ${formatUsd(notionalUsd)} ${lev}at ${formatUsd(entry)}`.replace(
		/ {2,}/g,
		" ",
	);
}

export function renderClose(coin: string, side: "long" | "short", pnlUsd: number, pnlPct: number | null): string {
	const pct = pnlPct === null ? "" : ` (${signedPct(pnlPct)})`;
	return `closed ${coin.toLowerCase()} ${side} for ${signedUsd(pnlUsd)}${pct}`;
}

function fundingDelta(funding: HyperliquidFunding): HyperliquidFundingDelta {
	return funding.delta ?? funding;
}

export function renderFunding(funding: HyperliquidFunding): string {
	const delta = fundingDelta(funding);
	const coin = (delta.coin ?? "asset").toLowerCase();
	const usdc = numberOr(delta.usdc) ?? 0;
	const verb = usdc >= 0 ? "received" : "paid";
	return `${verb} ${formatUsd(Math.abs(usdc))} ${coin} funding`;
}

function signedPct(value: number): string {
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}%`;
}

export function isLiquidation(fill: HyperliquidFill): boolean {
	if (fill.liquidation) return true;
	const dir = (fill.dir ?? "").toLowerCase();
	return dir.includes("liquidat");
}

async function postInfo<T>(
	url: string,
	body: unknown,
	fetchImpl: typeof fetch = fetch,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	const res = await fetchImpl(`${url}/info`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: timeoutSignal,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Hyperliquid info request failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`.trim());
	}
	return (await res.json()) as T;
}

async function listHyperliquidWallets(context: WorkerContext): Promise<WalletTarget[]> {
	const rows = await context.db
		.select({
			walletId: agentWalletRegistry.id,
			address: agentWalletRegistry.address,
			agentTokenAddress: agentWalletRegistry.agentTokenAddress,
			internalAgentId: agentPersonas.agentId,
		})
		.from(agentWalletRegistry)
		.leftJoin(agentPersonas, eq(agentPersonas.tokenAddress, agentWalletRegistry.agentTokenAddress))
		.where(eq(agentWalletRegistry.venue, "hyperliquid"));
	return rows.map((row) => ({
		walletId: row.walletId,
		address: row.address,
		agentTokenAddress: row.agentTokenAddress,
		agentId: row.internalAgentId ?? null,
	}));
}

async function readLastFillTid(context: WorkerContext, agentTokenAddress: string): Promise<number | null> {
	const [row] = await context.db
		.select({ data: agentEvents.data })
		.from(agentEvents)
		.where(and(eq(agentEvents.tokenAddress, agentTokenAddress), eq(agentEvents.eventType, "trade.fill")))
		.orderBy(desc(agentEvents.occurredAt))
		.limit(1);
	if (!row) return null;
	const tid = (row.data as Record<string, unknown>)?.tid;
	return typeof tid === "number" ? tid : null;
}

async function readLastFundingTime(context: WorkerContext, agentTokenAddress: string): Promise<number | null> {
	const [row] = await context.db
		.select({ data: agentEvents.data, occurredAt: agentEvents.occurredAt })
		.from(agentEvents)
		.where(and(eq(agentEvents.tokenAddress, agentTokenAddress), eq(agentEvents.eventType, "hl_funding")))
		.orderBy(desc(agentEvents.occurredAt))
		.limit(1);
	if (!row) return null;
	const time = (row.data as Record<string, unknown>)?.time;
	if (typeof time === "number" && Number.isFinite(time)) return time;
	return row.occurredAt?.getTime() ?? null;
}

type TradeRationaleAction = "open" | "close";
type TradeRationaleSide = "long" | "short";
type TradeRationaleMatch = { id: string; reason: string };

function normalizeRationaleCoin(coin: string): string {
	return coin.trim().toUpperCase();
}

export function withTradeRationaleReason(
	data: Record<string, unknown>,
	rationale: TradeRationaleMatch | null,
): Record<string, unknown> {
	if (!rationale) return data;
	return { ...data, reason: rationale.reason };
}

export async function findTradeRationale(
	context: WorkerContext,
	params: {
		agentId: string | null;
		coin: string;
		action: TradeRationaleAction;
		side?: TradeRationaleSide | null;
		now?: Date;
	},
): Promise<TradeRationaleMatch | null> {
	if (!params.agentId) return null;
	try {
		const now = params.now ?? new Date();
		const since = new Date(now.getTime() - TRADE_RATIONALE_LOOKBACK_MS);
		const normalizedCoin = normalizeRationaleCoin(params.coin);
		const filters = [
			eq(tradeRationales.agentId, params.agentId),
			eq(tradeRationales.coin, normalizedCoin),
			isNull(tradeRationales.consumedAt),
			gte(tradeRationales.createdAt, since),
			or(isNull(tradeRationales.action), eq(tradeRationales.action, params.action)),
		];
		if (params.side) filters.push(or(isNull(tradeRationales.side), eq(tradeRationales.side, params.side)));
		const [row] = await context.db
			.select({ id: tradeRationales.id, reason: tradeRationales.reason })
			.from(tradeRationales)
			.where(and(...filters))
			.orderBy(desc(tradeRationales.createdAt))
			.limit(1);
		return row ?? null;
	} catch (err) {
		context.logger.warn(
			{ err: errorDetails(err), agentId: params.agentId, coin: params.coin, action: params.action },
			"hl-listener trade rationale lookup failed; emitting without reason",
		);
		return null;
	}
}

export async function consumeTradeRationale(context: WorkerContext, rationaleId: string): Promise<void> {
	try {
		await context.db
			.update(tradeRationales)
			.set({ consumedAt: new Date() })
			.where(and(eq(tradeRationales.id, rationaleId), isNull(tradeRationales.consumedAt)));
	} catch (err) {
		context.logger.warn(
			{ err: errorDetails(err), rationaleId },
			"hl-listener trade rationale consume failed after event insert",
		);
	}
}

export async function insertEnrichedTradeEvent(
	context: WorkerContext,
	params: {
		agentId: string | null;
		agentTokenAddress: string;
		eventType: "trade.open" | "trade.close" | "trade.fill";
		legacyType: string;
		payload: Record<string, unknown>;
		data: Record<string, unknown>;
		txHash: string | null;
		sourceEventId: string;
		occurredAt?: Date;
		coin: string;
		action: TradeRationaleAction;
		side?: TradeRationaleSide | null;
	},
): Promise<boolean> {
	const rationale = await findTradeRationale(context, {
		agentId: params.agentId,
		coin: params.coin,
		action: params.action,
		side: params.side,
	});
	const payload = withTradeRationaleReason(params.payload, rationale);
	const data = rationale ? renderEventData(params.eventType, payload) : params.data;
	const inserted = await insertTradeEvent(context, {
		...params,
		payload,
		data,
	});
	if (inserted && rationale) await consumeTradeRationale(context, rationale.id);
	return inserted;
}

async function insertTradeEvent(
	context: WorkerContext,
	params: {
		agentId: string | null;
		agentTokenAddress: string;
		eventType: "trade.fill" | "trade.open" | "trade.close" | "trade.liquidation" | "hl_funding";
		legacyType: string;
		payload: Record<string, unknown>;
		data: Record<string, unknown>;
		txHash: string | null;
		sourceEventId: string;
		occurredAt?: Date;
	},
): Promise<boolean> {
	try {
		const rows = await context.db
			.insert(agentEvents)
			.values({
				agentId: params.agentId,
				eventType: params.eventType,
				data: params.data,
				source: "hl-listener",
				sourceEventId: params.sourceEventId,
				occurredAt: params.occurredAt ?? new Date(),
				payload: params.payload,
				type: params.legacyType,
				status: "done",
				chainId: ARBITRUM_CHAIN_ID,
				tokenAddress: params.agentTokenAddress,
				txHash: params.txHash,
				processedAt: new Date(),
			})
			.onConflictDoNothing()
			.returning({ id: agentEvents.id });
		return rows.length > 0;
	} catch (err) {
		context.logger.error({ err: errorDetails(err), eventType: params.eventType }, "failed to insert HL trade event");
		return false;
	}
}

export async function processFills(
	context: WorkerContext,
	wallet: WalletTarget,
	deps: HyperliquidListenerOptions,
): Promise<Pick<WalletTickMetrics, "fillsFetched" | "fillsSkipped" | "fillsEmitted">> {
	const fetchImpl = deps.fetch ?? fetch;
	const baseUrl = deps.baseUrl ?? HL_BASE_URL;
	const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	const lastTid = await readLastFillTid(context, wallet.agentTokenAddress);
	const sinceMs =
		Date.now() -
		boundedWindow(deps.fillsBackfillWindowMs, DEFAULT_FILLS_BACKFILL_WINDOW_MS, MAX_FILLS_BACKFILL_WINDOW_MS);

	const scopedFills: Array<{ scope: HyperliquidDexScope; fill: HyperliquidFill }> = [];
	for (const scope of hyperliquidDexScopes(deps.builderDexs)) {
		try {
			const fills = await postInfo<HyperliquidFill[]>(
				baseUrl,
				scopedInfoBody({ type: "userFillsByTime", user: wallet.address, startTime: sinceMs }, scope),
				fetchImpl,
				requestTimeoutMs,
			);
			if (!Array.isArray(fills)) throw new Error("Hyperliquid userFillsByTime returned a non-array response");
			for (const fill of fills) scopedFills.push({ scope, fill });
		} catch (err) {
			if (!scope.dex) throw err;
			context.logger.warn(
				{ err: errorDetails(err), wallet: wallet.address, dex: scope.dex },
				"hl-listener builder-dex userFillsByTime poll failed; continuing",
			);
		}
	}

	const fillsByTid = new Map<number, { scope: HyperliquidDexScope; fill: HyperliquidFill }>();
	const unkeyedFills: Array<{ scope: HyperliquidDexScope; fill: HyperliquidFill }> = [];
	for (const item of scopedFills) {
		if (typeof item.fill.tid !== "number") {
			unkeyedFills.push(item);
			continue;
		}
		const existing = fillsByTid.get(item.fill.tid);
		fillsByTid.set(item.fill.tid, existing ? preferScopedFill(existing, item) : item);
	}
	const mergedFills = [...fillsByTid.values(), ...unkeyedFills];

	const metrics = { fillsFetched: mergedFills.length, fillsSkipped: 0, fillsEmitted: 0 };
	const maxFetchedTid = mergedFills.reduce<number | null>((max, { fill }) => {
		if (typeof fill.tid !== "number") return max;
		return max === null ? fill.tid : Math.max(max, fill.tid);
	}, null);
	const ignoreLastTid = lastTid !== null && maxFetchedTid !== null && lastTid > maxFetchedTid;
	if (ignoreLastTid) {
		context.logger.error(
			{ wallet: wallet.address, lastTid, maxFetchedTid, sinceMs },
			"hl-listener fill cursor is ahead of fetched data; replaying bounded window with idempotency",
		);
	}

	// Sort by exchange time to preserve feed order across core and builder-dex fills.
	const sorted = [...mergedFills].sort((a, b) => (a.fill.time ?? a.fill.tid ?? 0) - (b.fill.time ?? b.fill.tid ?? 0));
	for (const { scope, fill } of sorted) {
		const tid = fill.tid;
		if (typeof tid !== "number") {
			metrics.fillsSkipped += 1;
			context.logger.warn({ wallet: wallet.address, fill }, "hl-listener skipped fill without numeric tid");
			continue;
		}
		if (!scope.dex && !ignoreLastTid && lastTid !== null && tid <= lastTid) {
			metrics.fillsSkipped += 1;
			continue;
		}

		const coin = normalizeBuilderCoin(fill.coin ?? "", scope);
		const px = numberOr(fill.px) ?? 0;
		const sz = numberOr(fill.sz) ?? 0;
		const fee = numberOr(fill.fee) ?? 0;
		const pnl = numberOr(fill.closedPnl) ?? 0;
		const side: "buy" | "sell" = fill.side === "A" ? "sell" : "buy";

		const liq = isLiquidation(fill);
		const payload = {
			walletAddress: wallet.address.toLowerCase(),
			tid,
			fillId: tid,
			coin,
			asset: coin.toLowerCase(),
			side,
			direction: fill.dir ?? null,
			size: sz,
			price: px,
			fee,
			feeToken: fill.feeToken ?? "USDC",
			closedPnl: pnl,
			oid: fill.oid ?? null,
			venue: "hyperliquid",
			rawHash: fill.hash ?? null,
			time: fill.time ?? null,
			timestamp: typeof fill.time === "number" ? new Date(fill.time).toISOString() : null,
		};
		const eventType = liq ? "trade.liquidation" : "trade.fill";
		const data = renderEventData(eventType, payload);

		const inserted = await insertTradeEvent(context, {
			agentId: wallet.agentId,
			agentTokenAddress: wallet.agentTokenAddress,
			eventType,
			legacyType: liq ? "trade.liquidation" : "trade.fill",
			payload,
			data,
			txHash: fill.hash ?? null,
			sourceEventId: scopedSourceEventId("hl", scope, tid),
			occurredAt: typeof fill.time === "number" ? new Date(fill.time) : undefined,
		});
		if (inserted) metrics.fillsEmitted += 1;
	}
	if (metrics.fillsSkipped > 0) {
		context.logger.info(
			{ wallet: wallet.address, skipped: metrics.fillsSkipped, fetched: metrics.fillsFetched, lastTid },
			"hl-listener skipped previously seen fills",
		);
	}
	return metrics;
}

async function processFunding(
	context: WorkerContext,
	wallet: WalletTarget,
	deps: HyperliquidListenerOptions,
	forceBackfill = false,
): Promise<Pick<WalletTickMetrics, "fundingFetched" | "fundingSkipped" | "fundingEmitted">> {
	const fetchImpl = deps.fetch ?? fetch;
	const baseUrl = deps.baseUrl ?? HL_BASE_URL;
	const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	const backfillWindowMs = boundedWindow(
		deps.fundingBackfillWindowMs,
		DEFAULT_FUNDING_BACKFILL_WINDOW_MS,
		MAX_FUNDING_BACKFILL_WINDOW_MS,
	);
	const boundedSinceMs = Date.now() - backfillWindowMs;
	const lastFundingTime = await readLastFundingTime(context, wallet.agentTokenAddress);
	const cursorLooksCorrupt = lastFundingTime !== null && lastFundingTime > Date.now() + CURSOR_FUTURE_SKEW_MS;
	if (cursorLooksCorrupt) {
		context.logger.error(
			{ wallet: wallet.address, lastFundingTime, boundedSinceMs },
			"hl-listener funding cursor is in the future; replaying bounded window with idempotency",
		);
	}
	if (forceBackfill) {
		context.logger.info(
			{ wallet: wallet.address, lastFundingTime, boundedSinceMs },
			"hl-listener running one-shot funding backfill window",
		);
	}
	const startTime =
		forceBackfill || cursorLooksCorrupt || lastFundingTime === null
			? boundedSinceMs
			: Math.max(boundedSinceMs, lastFundingTime + 1);
	const scopedFunding: Array<{ scope: HyperliquidDexScope; entry: HyperliquidFunding }> = [];
	for (const scope of hyperliquidDexScopes(deps.builderDexs)) {
		try {
			const funding = await postInfo<HyperliquidFunding[]>(
				baseUrl,
				scopedInfoBody({ type: "userFunding", user: wallet.address, startTime }, scope),
				fetchImpl,
				requestTimeoutMs,
			);
			if (!Array.isArray(funding)) throw new Error("Hyperliquid userFunding returned a non-array response");
			for (const entry of funding) scopedFunding.push({ scope, entry });
		} catch (err) {
			if (!scope.dex) throw err;
			context.logger.warn(
				{ err: errorDetails(err), wallet: wallet.address, dex: scope.dex },
				"hl-listener builder-dex userFunding poll failed; continuing",
			);
		}
	}

	const metrics = { fundingFetched: scopedFunding.length, fundingSkipped: 0, fundingEmitted: 0 };
	const sorted = [...scopedFunding].sort((a, b) => (a.entry.time ?? 0) - (b.entry.time ?? 0));
	for (const { scope, entry } of sorted) {
		const delta = fundingDelta(entry);
		if (typeof entry.time !== "number" || !delta.coin) {
			metrics.fundingSkipped += 1;
			context.logger.warn({ wallet: wallet.address, entry }, "hl-listener skipped malformed funding row");
			continue;
		}
		const coin = normalizeBuilderCoin(delta.coin, scope);
		const usdc = numberOr(delta.usdc) ?? 0;
		const szi = numberOr(delta.szi) ?? 0;
		const fundingRate = numberOr(delta.fundingRate) ?? 0;
		const payload = {
			walletAddress: wallet.address.toLowerCase(),
			coin,
			asset: coin.toLowerCase(),
			fundingRate,
			size: Math.abs(szi),
			szi,
			usdc,
			amountUsd: usdc,
			venue: "hyperliquid",
			time: entry.time,
			timestamp: new Date(entry.time).toISOString(),
		};
		const data = renderEventData("hl_funding", payload);
		const inserted = await insertTradeEvent(context, {
			agentId: wallet.agentId,
			agentTokenAddress: wallet.agentTokenAddress,
			eventType: "hl_funding",
			legacyType: "hl_funding",
			payload,
			data,
			txHash: entry.hash && !/^0x0+$/.test(entry.hash) ? entry.hash : null,
			sourceEventId: scopedSourceEventId(`hl:funding:${wallet.address.toLowerCase()}:${coin}`, scope, entry.time),
			occurredAt: new Date(entry.time),
		});
		if (inserted) metrics.fundingEmitted += 1;
	}
	if (metrics.fundingSkipped > 0) {
		context.logger.info(
			{ wallet: wallet.address, skipped: metrics.fundingSkipped, fetched: metrics.fundingFetched, startTime },
			"hl-listener skipped funding rows",
		);
	}
	return metrics;
}

async function processPositions(
	context: WorkerContext,
	wallet: WalletTarget,
	previous: Map<string, PositionSnapshot>,
	deps: HyperliquidListenerOptions,
): Promise<{ next: Map<string, PositionSnapshot>; emitted: number }> {
	const fetchImpl = deps.fetch ?? fetch;
	const baseUrl = deps.baseUrl ?? HL_BASE_URL;
	const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	const scopedStates: Array<{ scope: HyperliquidDexScope; state: HyperliquidClearinghouseState }> = [];
	for (const scope of hyperliquidDexScopes(deps.builderDexs)) {
		try {
			const state = await postInfo<HyperliquidClearinghouseState>(
				baseUrl,
				scopedInfoBody({ type: "clearinghouseState", user: wallet.address }, scope),
				fetchImpl,
				requestTimeoutMs,
			);
			if (state) scopedStates.push({ scope, state });
		} catch (err) {
			if (!scope.dex) throw err;
			context.logger.warn(
				{ err: errorDetails(err), wallet: wallet.address, dex: scope.dex },
				"hl-listener builder-dex clearinghouseState poll failed; continuing",
			);
		}
	}
	if (scopedStates.length === 0) return { next: previous, emitted: 0 };

	const next = new Map<string, PositionSnapshot>();
	for (const { scope, state } of scopedStates) {
		for (const entry of state.assetPositions ?? []) {
			const pos = entry.position;
			if (!pos?.coin) continue;
			const coin = normalizeBuilderCoin(pos.coin, scope);
			const szi = numberOr(pos.szi);
			if (szi === null || szi === 0) continue;
			next.set(coin, {
				coin,
				szi,
				entryPx: numberOr(pos.entryPx),
				leverage: leverageValue(pos.leverage),
			});
		}
	}

	// First poll seeds; do not emit synthetic events.
	if (previous.size === 0 && next.size === 0) return { next, emitted: 0 };

	let emitted = 0;
	// Compare
	const coins = new Set<string>([...previous.keys(), ...next.keys()]);
	for (const coin of coins) {
		const before = previous.get(coin);
		const after = next.get(coin);
		// Opened from zero
		if (!before && after) {
			const recentFill = await readRecentFillForCoin(context, wallet.agentTokenAddress, wallet.address, coin);
			const lifecycleId = recentFill.tid ?? Date.now();
			// The position-snapshot diff carries no time of its own. Prefer the
			// matching fill's on-chain time so the feed shows when the trade
			// actually opened, not when the worker ingested the diff.
			const fillTime = recentFill.time;
			const occurredAt = fillTime !== null ? new Date(fillTime) : undefined;
			const notional = Math.abs(after.szi) * (after.entryPx ?? 0);
			const margin = after.leverage ? notional / after.leverage : notional;
			const payload = {
				coin,
				asset: coin.toLowerCase(),
				side: sideFromSzi(after.szi),
				size: Math.abs(after.szi),
				entryPrice: after.entryPx,
				leverage: after.leverage,
				notionalUsd: notional,
				marginUsd: margin,
				venue: "hyperliquid",
				time: fillTime,
				timestamp: fillTime !== null ? new Date(fillTime).toISOString() : null,
			};
			const side = sideFromSzi(after.szi);
			const inserted = await insertEnrichedTradeEvent(context, {
				agentId: wallet.agentId,
				agentTokenAddress: wallet.agentTokenAddress,
				eventType: "trade.open",
				legacyType: "trade.open",
				payload,
				data: renderEventData("trade.open", payload),
				txHash: null,
				sourceEventId: `hl:${wallet.address.toLowerCase()}:${coin}:open:${lifecycleId}`,
				occurredAt,
				coin,
				action: "open",
				side,
			});
			if (inserted) emitted += 1;
			continue;
		}
		// Fully closed
		if (before && !after) {
			// We don't have realized PnL on the position diff alone; use the
			// most recent fill's closedPnl for this coin as a hint.
			const closeHint = await readRecentClosedPnlForCoin(context, wallet.agentTokenAddress, wallet.address, coin);
			const pnl = closeHint.pnl;
			const lifecycleId = closeHint.latestTid ?? Date.now();
			// Use the closing fill's on-chain time so the feed shows when the
			// position actually closed, not the ingestion time.
			const fillTime = closeHint.latestTime;
			const occurredAt = fillTime !== null ? new Date(fillTime) : undefined;
			const notionalAtEntry = Math.abs(before.szi) * (before.entryPx ?? 0);
			const pnlPct =
				pnl !== null && notionalAtEntry > 0 && before.leverage
					? (pnl / (notionalAtEntry / before.leverage)) * 100
					: null;
			const side = sideFromSzi(before.szi);
			const payload = {
				coin,
				asset: coin.toLowerCase(),
				side,
				size: Math.abs(before.szi),
				entryPrice: before.entryPx,
				leverage: before.leverage,
				pnlUsd: pnl ?? 0,
				pnlPct,
				venue: "hyperliquid",
				time: fillTime,
				timestamp: fillTime !== null ? new Date(fillTime).toISOString() : null,
			};
			const inserted = await insertEnrichedTradeEvent(context, {
				agentId: wallet.agentId,
				agentTokenAddress: wallet.agentTokenAddress,
				eventType: "trade.close",
				legacyType: "trade.close",
				payload,
				data: renderEventData("trade.close", payload),
				txHash: null,
				sourceEventId: `hl:${wallet.address.toLowerCase()}:${coin}:close:${lifecycleId}`,
				occurredAt,
				coin,
				action: "close",
				side,
			});
			if (inserted) emitted += 1;
			continue;
		}
		// Position adjusted (same side, size changed): emit a trade.fill "added to
		// position" / "trimmed position" event so scale-ins and partial scale-outs
		// show in the activity feed (not just open-from-zero / full close).
		if (before && after) {
			const sameSide = before.szi > 0 === after.szi > 0;
			const sizeDelta = Math.abs(after.szi) - Math.abs(before.szi);
			// Ignore dust-level jitter; only emit on a material size change.
			const priceRef = after.entryPx ?? before.entryPx ?? 0;
			const notionalDelta = Math.abs(sizeDelta) * priceRef;
			if (!sameSide || Math.abs(sizeDelta) < 1e-9 || notionalDelta < 50) continue;
			const increased = Math.abs(after.szi) > Math.abs(before.szi);
			const recentFill = await readRecentFillForCoin(context, wallet.agentTokenAddress, wallet.address, coin);
			const lifecycleId = recentFill.tid ?? Date.now();
			const fillTime = recentFill.time;
			const occurredAt = fillTime !== null ? new Date(fillTime) : undefined;
			const side = sideFromSzi(after.szi);
			const payload = {
				coin,
				asset: coin.toLowerCase(),
				side,
				dir: increased ? "added" : "trimmed",
				size: Math.abs(sizeDelta),
				price: priceRef,
				entryPrice: after.entryPx,
				leverage: after.leverage,
				notionalUsd: notionalDelta,
				venue: "hyperliquid",
				time: fillTime,
				timestamp: fillTime !== null ? new Date(fillTime).toISOString() : null,
			};
			const inserted = await insertEnrichedTradeEvent(context, {
				agentId: wallet.agentId,
				agentTokenAddress: wallet.agentTokenAddress,
				eventType: "trade.fill",
				legacyType: "trade.fill",
				payload,
				data: renderEventData("trade.fill", payload),
				txHash: null,
				sourceEventId: `hl:${wallet.address.toLowerCase()}:${coin}:adj:${lifecycleId}:${Math.abs(after.szi).toFixed(6)}`,
				occurredAt,
				coin,
				action: "open",
				side,
			});
			if (inserted) emitted += 1;
		}
	}

	return { next, emitted };
}

// Number of recent fill rows to scan when resolving the lifecycle fill for a
// position-diff open/close. Wide enough that a busy multi-coin agent's
// relevant fill stays in the window (it is then filtered by wallet + coin in
// JS); narrow enough to stay a cheap indexed read.
const FILL_LOOKUP_LIMIT = 60;

async function readRecentFillForCoin(
	context: WorkerContext,
	agentTokenAddress: string,
	walletAddress: string,
	coin: string,
): Promise<{ tid: number | null; time: number | null }> {
	const rows = await context.db
		.select({ data: agentEvents.data, occurredAt: agentEvents.occurredAt })
		.from(agentEvents)
		.where(and(eq(agentEvents.tokenAddress, agentTokenAddress), eq(agentEvents.eventType, "trade.fill")))
		.orderBy(desc(agentEvents.occurredAt))
		.limit(FILL_LOOKUP_LIMIT);
	const wallet = walletAddress.toLowerCase();
	// Rows arrive newest-first. The opening fill for a "position appeared from
	// zero" diff is the most recent fill whose direction starts with "open";
	// prefer that so a later resize/add fill on the same coin does not stamp the
	// open with the wrong time. Fall back to the newest matching fill.
	let newestMatch: { tid: number | null; time: number | null } | null = null;
	for (const row of rows) {
		const data = row.data as Record<string, unknown>;
		if (typeof data.walletAddress === "string" && data.walletAddress.toLowerCase() !== wallet) continue;
		if ((data.coin ?? "") !== coin) continue;
		const tid = typeof data.tid === "number" ? data.tid : null;
		const time =
			typeof data.time === "number" && Number.isFinite(data.time) ? data.time : (row.occurredAt?.getTime() ?? null);
		if (newestMatch === null) newestMatch = { tid, time };
		const dir = String(data.direction ?? "").toLowerCase();
		if (dir.startsWith("open")) return { tid, time };
	}
	if (newestMatch) return newestMatch;
	return { tid: null, time: null };
}

async function readRecentClosedPnlForCoin(
	context: WorkerContext,
	agentTokenAddress: string,
	walletAddress: string,
	coin: string,
): Promise<{ pnl: number | null; latestTid: number | null; latestTime: number | null }> {
	const rows = await context.db
		.select({ data: agentEvents.data, occurredAt: agentEvents.occurredAt })
		.from(agentEvents)
		.where(and(eq(agentEvents.tokenAddress, agentTokenAddress), eq(agentEvents.eventType, "trade.fill")))
		.orderBy(desc(agentEvents.occurredAt))
		.limit(FILL_LOOKUP_LIMIT);
	let total: number | null = null;
	let latestTid: number | null = null;
	let latestTime: number | null = null;
	const wallet = walletAddress.toLowerCase();
	for (const row of rows) {
		const data = row.data as Record<string, unknown>;
		if (typeof data.walletAddress === "string" && data.walletAddress.toLowerCase() !== wallet) continue;
		if ((data.coin ?? "") !== coin) continue;
		if (latestTid === null && typeof data.tid === "number") latestTid = data.tid;
		if (latestTime === null) {
			latestTime =
				typeof data.time === "number" && Number.isFinite(data.time) ? data.time : (row.occurredAt?.getTime() ?? null);
		}
		const pnl = Number(data.closedPnl);
		if (!Number.isFinite(pnl) || pnl === 0) continue;
		total = (total ?? 0) + pnl;
		// We only attribute the most recent close-direction fills; conservative
		// heuristic: stop once we see a fill whose dir starts with "Open".
		const dir = String(data.direction ?? "").toLowerCase();
		if (dir.startsWith("open")) break;
	}
	return { pnl: total, latestTid, latestTime };
}

export function startHyperliquidListener(
	context: WorkerContext,
	options: HyperliquidListenerOptions = {},
): ListenerHandle {
	const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const tickWatchdogMs = options.tickWatchdogMs ?? DEFAULT_TICK_WATCHDOG_MS;
	const positionSnapshots = new Map<string, Map<string, PositionSnapshot>>();
	const fundingBackfilledWallets = new Set<string>();
	let stopped = false;
	let running = false;
	let timer: NodeJS.Timeout | null = null;
	let watchdogTimer: NodeJS.Timeout | null = null;
	let activeTickId = 0;

	const scheduleNext = () => {
		if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
	};

	const tick = async () => {
		if (stopped) return;
		if (running) {
			context.logger.warn({ activeTickId }, "hl-listener tick skipped because previous tick is still running");
			return;
		}
		running = true;
		const tickId = ++activeTickId;
		const startedAt = Date.now();
		const metrics: TickMetrics = { ...emptyWalletMetrics(), walletsPolled: 0, walletsFailed: 0, durationMs: 0 };
		let watchdogFired = false;
		const currentWatchdogTimer = setTimeout(() => {
			if (!running || activeTickId !== tickId || stopped) return;
			watchdogFired = true;
			activeTickId += 1;
			running = false;
			context.logger.error(
				{ tickId, durationMs: Date.now() - startedAt, tickWatchdogMs },
				"hl-listener tick exceeded watchdog; forcing listener state reset",
			);
			scheduleNext();
		}, tickWatchdogMs);
		watchdogTimer = currentWatchdogTimer;
		try {
			const wallets = await listHyperliquidWallets(context);
			for (const wallet of wallets) {
				metrics.walletsPolled += 1;
				try {
					const walletMetrics = emptyWalletMetrics();
					Object.assign(walletMetrics, await processFills(context, wallet, options));
					if (activeTickId !== tickId || watchdogFired || stopped) break;
					const forceFundingBackfill = !fundingBackfilledWallets.has(wallet.walletId);
					Object.assign(walletMetrics, await processFunding(context, wallet, options, forceFundingBackfill));
					fundingBackfilledWallets.add(wallet.walletId);
					if (activeTickId !== tickId || watchdogFired || stopped) break;
					const prev = positionSnapshots.get(wallet.walletId) ?? new Map<string, PositionSnapshot>();
					const { next, emitted } = await processPositions(context, wallet, prev, options);
					if (activeTickId !== tickId || watchdogFired || stopped) break;
					walletMetrics.positionEventsEmitted = emitted;
					positionSnapshots.set(wallet.walletId, next);
					addWalletMetrics(metrics, walletMetrics);
				} catch (err) {
					metrics.walletsFailed += 1;
					context.logger.error(
						{ err: errorDetails(err), wallet: wallet.address, agentTokenAddress: wallet.agentTokenAddress },
						"hl-listener wallet tick failed",
					);
				}
			}
		} catch (err) {
			context.logger.error({ err: errorDetails(err) }, "hl-listener tick failed");
		} finally {
			clearTimeout(currentWatchdogTimer);
			if (watchdogTimer === currentWatchdogTimer) {
				watchdogTimer = null;
			}
			metrics.durationMs = Date.now() - startedAt;
			context.logger.info(metrics, "hl-listener tick heartbeat");
			if (activeTickId === tickId && !watchdogFired) {
				running = false;
				scheduleNext();
			}
		}
	};

	context.logger.info({ intervalMs, tickWatchdogMs }, "starting hyperliquid trade listener");
	timer = setTimeout(() => void tick(), 100);

	return {
		stop: async () => {
			stopped = true;
			if (timer) clearTimeout(timer);
			if (watchdogTimer) clearTimeout(watchdogTimer);
		},
	};
}
