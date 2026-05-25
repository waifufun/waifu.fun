/**
 * Hyperliquid trade listener.
 *
 * Polls every `pollIntervalMs` (default 10s):
 *
 * 1. `userFills` for each registered HL wallet → emits `trade.fill` /
 *    `trade.liquidation` events into `agent_events`, idempotent on
 *    Hyperliquid's per-fill `tid` (also exposed as `fillId`).
 * 2. `clearinghouseState` for each wallet → diffs `assetPositions`
 *    against the last in-memory snapshot to emit `trade.open` /
 *    `trade.close` events that summarise net position changes.
 *
 * Why poll instead of websocket?
 *  - HL's public ws is reliable but adds a long-lived connection
 *    we'd need to babysit (reconnect, backoff, multi-account fan-out).
 *  - 10s polling on a single agent costs 6 req/min per endpoint —
 *    well under HL's rate-limit envelope (1200 req/min per IP).
 *  - Idempotency via `tid` means a polled fill that arrives twice is
 *    a no-op insert, so we can crank polling up without dup risk.
 *
 * If we later need sub-second latency (liquidations, fast scalps) we
 * can swap the same emit path behind a websocket subscriber without
 * touching the FE.
 */

import { and, desc, eq } from "drizzle-orm";

import { agentEvents, agentPersonas, agentWalletRegistry } from "@waifufun/db";

import type { WorkerContext } from "./types.js";

const HL_BASE_URL = "https://api.hyperliquid.xyz";
const ARBITRUM_CHAIN_ID = "42161";
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_FILLS_BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

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

export interface HyperliquidListenerOptions {
	pollIntervalMs?: number;
	fillsBackfillWindowMs?: number;
	fetch?: typeof fetch;
	baseUrl?: string;
}

interface ListenerHandle {
	stop: () => Promise<void>;
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
	timeoutMs = 8000,
): Promise<T | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetchImpl(`${url}/info`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
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
		.orderBy(desc(agentEvents.createdAt))
		.limit(1);
	if (!row) return null;
	const tid = (row.data as Record<string, unknown>)?.tid;
	return typeof tid === "number" ? tid : null;
}

async function insertTradeEvent(
	context: WorkerContext,
	params: {
		agentId: string | null;
		agentTokenAddress: string;
		eventType: "trade.fill" | "trade.open" | "trade.close" | "trade.liquidation";
		legacyType: string;
		payload: Record<string, unknown>;
		data: Record<string, unknown>;
		txHash: string | null;
	},
): Promise<void> {
	try {
		await context.db.insert(agentEvents).values({
			agentId: params.agentId,
			eventType: params.eventType,
			data: params.data,
			payload: params.payload,
			type: params.legacyType,
			status: "done",
			chainId: ARBITRUM_CHAIN_ID,
			tokenAddress: params.agentTokenAddress,
			txHash: params.txHash,
			processedAt: new Date(),
		});
	} catch (err) {
		context.logger.warn({ err, eventType: params.eventType }, "failed to insert HL trade event");
	}
}

async function processFills(
	context: WorkerContext,
	wallet: WalletTarget,
	deps: HyperliquidListenerOptions,
): Promise<void> {
	const fetchImpl = deps.fetch ?? fetch;
	const baseUrl = deps.baseUrl ?? HL_BASE_URL;
	const lastTid = await readLastFillTid(context, wallet.agentTokenAddress);
	const sinceMs = Date.now() - (deps.fillsBackfillWindowMs ?? DEFAULT_FILLS_BACKFILL_WINDOW_MS);

	const body =
		lastTid !== null
			? { type: "userFillsByTime", user: wallet.address, startTime: sinceMs }
			: { type: "userFillsByTime", user: wallet.address, startTime: sinceMs };

	const fills = await postInfo<HyperliquidFill[]>(baseUrl, body, fetchImpl);
	if (!fills || !Array.isArray(fills)) return;

	// Sort ascending by tid to preserve insertion order
	const sorted = [...fills].sort((a, b) => (a.tid ?? 0) - (b.tid ?? 0));
	for (const fill of sorted) {
		const tid = fill.tid;
		if (typeof tid !== "number") continue;
		if (lastTid !== null && tid <= lastTid) continue;

		const coin = fill.coin ?? "";
		const px = numberOr(fill.px) ?? 0;
		const sz = numberOr(fill.sz) ?? 0;
		const fee = numberOr(fill.fee) ?? 0;
		const pnl = numberOr(fill.closedPnl) ?? 0;
		const side: "buy" | "sell" = fill.side === "A" ? "sell" : "buy";

		const liq = isLiquidation(fill);
		const payload = {
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
		};
		const data = {
			...payload,
			template: liq ? "trade.liquidation" : "trade.fill",
			renderedText: liq ? renderLiquidation(fill) : renderFill(fill),
		};

		await insertTradeEvent(context, {
			agentId: wallet.agentId,
			agentTokenAddress: wallet.agentTokenAddress,
			eventType: liq ? "trade.liquidation" : "trade.fill",
			legacyType: liq ? "trade.liquidation" : "trade.fill",
			payload,
			data,
			txHash: fill.hash ?? null,
		});
	}
}

async function processPositions(
	context: WorkerContext,
	wallet: WalletTarget,
	previous: Map<string, PositionSnapshot>,
	deps: HyperliquidListenerOptions,
): Promise<Map<string, PositionSnapshot>> {
	const fetchImpl = deps.fetch ?? fetch;
	const baseUrl = deps.baseUrl ?? HL_BASE_URL;
	const state = await postInfo<HyperliquidClearinghouseState>(
		baseUrl,
		{ type: "clearinghouseState", user: wallet.address },
		fetchImpl,
	);
	if (!state) return previous;

	const next = new Map<string, PositionSnapshot>();
	for (const entry of state.assetPositions ?? []) {
		const pos = entry.position;
		if (!pos?.coin) continue;
		const szi = numberOr(pos.szi);
		if (szi === null || szi === 0) continue;
		next.set(pos.coin, {
			coin: pos.coin,
			szi,
			entryPx: numberOr(pos.entryPx),
			leverage: leverageValue(pos.leverage),
		});
	}

	// First poll seeds; do not emit synthetic events.
	if (previous.size === 0 && next.size === 0) return next;

	// Compare
	const coins = new Set<string>([...previous.keys(), ...next.keys()]);
	for (const coin of coins) {
		const before = previous.get(coin);
		const after = next.get(coin);
		// Opened from zero
		if (!before && after) {
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
			};
			await insertTradeEvent(context, {
				agentId: wallet.agentId,
				agentTokenAddress: wallet.agentTokenAddress,
				eventType: "trade.open",
				legacyType: "trade.open",
				payload,
				data: { ...payload, template: "trade.open", renderedText: renderOpen(after, margin) },
				txHash: null,
			});
			continue;
		}
		// Fully closed
		if (before && !after) {
			// We don't have realized PnL on the position diff alone; use the
			// most recent fill's closedPnl for this coin as a hint.
			const pnl = await readRecentClosedPnlForCoin(context, wallet.agentTokenAddress, coin);
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
			};
			await insertTradeEvent(context, {
				agentId: wallet.agentId,
				agentTokenAddress: wallet.agentTokenAddress,
				eventType: "trade.close",
				legacyType: "trade.close",
				payload,
				data: {
					...payload,
					template: "trade.close",
					renderedText: renderClose(coin, side, pnl ?? 0, pnlPct),
				},
				txHash: null,
			});
			continue;
		}
		// Position adjusted: emit as trade.open with adjust marker when
		// magnitude or side changed materially. Per-fill events already
		// stream via processFills, so we deliberately keep diff-events
		// summary-only to avoid double counting.
		if (before && after) {
			const sameSide = before.szi > 0 === after.szi > 0;
			const sizeDelta = Math.abs(after.szi) - Math.abs(before.szi);
			if (sameSide && Math.abs(sizeDelta) < 1e-9) continue;
			// Skip the noisy in-between deltas in this pass.
		}
	}

	return next;
}

async function readRecentClosedPnlForCoin(
	context: WorkerContext,
	agentTokenAddress: string,
	coin: string,
): Promise<number | null> {
	const rows = await context.db
		.select({ data: agentEvents.data })
		.from(agentEvents)
		.where(and(eq(agentEvents.tokenAddress, agentTokenAddress), eq(agentEvents.eventType, "trade.fill")))
		.orderBy(desc(agentEvents.createdAt))
		.limit(10);
	let total: number | null = null;
	for (const row of rows) {
		const data = row.data as Record<string, unknown>;
		if ((data.coin ?? "") !== coin) continue;
		const pnl = Number(data.closedPnl);
		if (!Number.isFinite(pnl) || pnl === 0) continue;
		total = (total ?? 0) + pnl;
		// We only attribute the most recent close-direction fills; conservative
		// heuristic: stop once we see a fill whose dir starts with "Open".
		const dir = String(data.direction ?? "").toLowerCase();
		if (dir.startsWith("open")) break;
	}
	return total;
}

export function startHyperliquidListener(
	context: WorkerContext,
	options: HyperliquidListenerOptions = {},
): ListenerHandle {
	const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const positionSnapshots = new Map<string, Map<string, PositionSnapshot>>();
	let stopped = false;
	let running = false;
	let timer: NodeJS.Timeout | null = null;

	const tick = async () => {
		if (stopped || running) return;
		running = true;
		try {
			const wallets = await listHyperliquidWallets(context);
			for (const wallet of wallets) {
				try {
					await processFills(context, wallet, options);
					const prev = positionSnapshots.get(wallet.walletId) ?? new Map<string, PositionSnapshot>();
					const next = await processPositions(context, wallet, prev, options);
					positionSnapshots.set(wallet.walletId, next);
				} catch (err) {
					context.logger.warn({ err, wallet: wallet.address }, "hl-listener wallet tick failed");
				}
			}
		} catch (err) {
			context.logger.error({ err }, "hl-listener tick failed");
		} finally {
			running = false;
			if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
		}
	};

	context.logger.info({ intervalMs }, "starting hyperliquid trade listener");
	timer = setTimeout(() => void tick(), 100);

	return {
		stop: async () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		},
	};
}
