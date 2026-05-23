import type { AgentWalletRole, Holding, NavStaleSource } from "../types.js";

export type PolymarketWalletForNav = {
	id: string;
	address: string;
	role: AgentWalletRole;
	label: string;
};

export type PolymarketEnumeratorDeps = {
	fetch?: typeof fetch;
	logger?: Pick<Console, "warn">;
};

type PolymarketPosition = {
	proxyWallet: string | undefined;
	asset: string | undefined;
	conditionId: string | undefined;
	market: { conditionId: string | undefined; slug: string | undefined; image: string | undefined } | undefined;
	title: string | undefined;
	slug: string | undefined;
	icon: string | undefined;
	eventId: string | undefined;
	eventSlug: string | undefined;
	outcome: string | undefined;
	outcomeIndex: number | undefined;
	size: number;
	avgPrice: number | undefined;
	initialValue: number | undefined;
	currentValue: number | undefined;
	cashPnl: number | undefined;
	percentPnl: number | undefined;
	totalBought: number | undefined;
	realizedPnl: number | undefined;
	percentRealizedPnl: number | undefined;
	curPrice: number | undefined;
	redeemable: boolean | undefined;
	mergeable: boolean | undefined;
	oppositeOutcome: string | undefined;
	oppositeAsset: string | undefined;
	endDate: string | undefined;
	negativeRisk: boolean | undefined;
};

const POLYMARKET_POSITIONS_URL = "https://data-api.polymarket.com/positions";

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parsePosition(value: unknown): PolymarketPosition | null {
	if (!isObject(value)) return null;
	const size = toNumber(value.size);
	if (size === undefined || size <= 0) return null;
	const market = isObject(value.market) ? value.market : undefined;
	return {
		proxyWallet: stringOrUndefined(value.proxyWallet),
		asset: stringOrUndefined(value.asset),
		conditionId: stringOrUndefined(value.conditionId),
		market: market
			? {
					conditionId: stringOrUndefined(market.conditionId),
					slug: stringOrUndefined(market.slug),
					image: stringOrUndefined(market.image),
				}
			: undefined,
		title: stringOrUndefined(value.title),
		slug: stringOrUndefined(value.slug),
		icon: stringOrUndefined(value.icon),
		eventId: stringOrUndefined(value.eventId),
		eventSlug: stringOrUndefined(value.eventSlug),
		outcome: stringOrUndefined(value.outcome),
		outcomeIndex: toNumber(value.outcomeIndex),
		size,
		avgPrice: toNumber(value.avgPrice),
		initialValue: toNumber(value.initialValue),
		currentValue: toNumber(value.currentValue),
		cashPnl: toNumber(value.cashPnl),
		percentPnl: toNumber(value.percentPnl),
		totalBought: toNumber(value.totalBought),
		realizedPnl: toNumber(value.realizedPnl),
		percentRealizedPnl: toNumber(value.percentRealizedPnl),
		curPrice: toNumber(value.curPrice),
		redeemable: typeof value.redeemable === "boolean" ? value.redeemable : undefined,
		mergeable: typeof value.mergeable === "boolean" ? value.mergeable : undefined,
		oppositeOutcome: stringOrUndefined(value.oppositeOutcome),
		oppositeAsset: stringOrUndefined(value.oppositeAsset),
		endDate: stringOrUndefined(value.endDate),
		negativeRisk: typeof value.negativeRisk === "boolean" ? value.negativeRisk : undefined,
	};
}

function assetName(position: PolymarketPosition): string {
	const slug = position.slug ?? position.market?.slug ?? position.conditionId ?? "polymarket";
	const outcome = position.outcome ?? "outcome";
	return `${slug}-${outcome}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function mapPosition(wallet: PolymarketWalletForNav, position: PolymarketPosition): Holding {
	const size = position.size;
	const valueUsd =
		position.currentValue !== undefined
			? Number(position.currentValue.toFixed(8))
			: position.curPrice !== undefined
				? Number((size * position.curPrice).toFixed(8))
				: null;
	const priceUsd = valueUsd !== null && size > 0 ? Number((valueUsd / size).toFixed(8)) : (position.curPrice ?? null);
	const marketId = position.market?.conditionId ?? position.conditionId ?? position.asset ?? null;
	return {
		walletId: wallet.id,
		walletAddress: wallet.address,
		walletLabel: wallet.label,
		walletRole: wallet.role,
		chain: "polygon",
		asset: assetName(position),
		contract: marketId,
		balance: size,
		priceUsd,
		valueUsd,
		priced: valueUsd !== null,
		kind: "prediction",
		venue: "polymarket",
		...(position.asset ? { tokenId: position.asset } : {}),
		...(position.avgPrice !== undefined ? { entryPriceUsd: position.avgPrice } : {}),
		...(position.cashPnl !== undefined ? { unrealizedPnlUsd: position.cashPnl } : {}),
		metadata: {
			marketId,
			conditionId: marketId,
			marketSlug: position.slug ?? position.market?.slug ?? null,
			outcomeIndex: position.outcomeIndex ?? null,
			outcome: position.outcome ?? null,
			shares: size,
			avgPrice: position.avgPrice ?? null,
			pnlUsd: position.cashPnl ?? null,
			pnlPct: position.percentPnl ?? null,
			title: position.title ?? null,
			eventId: position.eventId ?? null,
			eventSlug: position.eventSlug ?? null,
			icon: position.icon ?? position.market?.image ?? null,
			initialValue: position.initialValue ?? null,
			currentValue: position.currentValue ?? null,
			curPrice: position.curPrice ?? null,
			totalBought: position.totalBought ?? null,
			realizedPnl: position.realizedPnl ?? null,
			percentRealizedPnl: position.percentRealizedPnl ?? null,
			redeemable: position.redeemable ?? null,
			mergeable: position.mergeable ?? null,
			oppositeOutcome: position.oppositeOutcome ?? null,
			oppositeAsset: position.oppositeAsset ?? null,
			proxyWallet: position.proxyWallet ?? null,
			endDate: position.endDate ?? null,
			negativeRisk: position.negativeRisk ?? null,
			source: "data-api.polymarket.com/positions",
		},
	};
}

export async function enumeratePolymarket(
	wallet: PolymarketWalletForNav,
	deps: PolymarketEnumeratorDeps = {},
): Promise<{ holdings: Holding[]; stale: NavStaleSource[] }> {
	const fetchImpl = deps.fetch ?? fetch;
	const logger = deps.logger ?? console;
	try {
		const url = new URL(POLYMARKET_POSITIONS_URL);
		url.searchParams.set("user", wallet.address);
		url.searchParams.set("sizeThreshold", "0.01");
		url.searchParams.set("limit", "500");
		url.searchParams.set("sortBy", "CURRENT");
		url.searchParams.set("sortDirection", "DESC");
		const res = await fetchImpl(url);
		if (!res.ok) return { holdings: [], stale: [{ source: "polymarket:positions", reason: `http-${res.status}` }] };
		const json = (await res.json()) as unknown;
		if (!Array.isArray(json)) {
			logger.warn("[nav:polymarket] malformed positions response", { walletAddress: wallet.address });
			return { holdings: [], stale: [] };
		}
		const parsed = json.map(parsePosition);
		if (parsed.some((position) => position === null) && json.length > 0) {
			logger.warn("[nav:polymarket] skipped malformed positions", { walletAddress: wallet.address });
		}
		return { holdings: parsed.flatMap((position) => (position ? [mapPosition(wallet, position)] : [])), stale: [] };
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: "polymarket:positions", reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}
