import type { EnumerationResult, Holding } from "../types.js";

type HyperliquidWallet = Pick<Holding, "walletId" | "walletAddress" | "walletLabel" | "walletRole" | "chain">;

export type HyperliquidEnumeratorDeps = {
	fetch?: typeof fetch;
	baseUrl?: string;
};

type HyperliquidPosition = {
	coin?: string;
	szi?: string | number;
	entryPx?: string | number;
	unrealizedPnl?: string | number;
	liquidationPx?: string | number | null;
	leverage?: { value?: string | number } | string | number;
	positionValue?: string | number;
};

type HyperliquidClearinghouseState = {
	marginSummary?: { accountValue?: string | number };
	crossMarginSummary?: { accountValue?: string | number };
	withdrawable?: string | number;
	assetPositions?: Array<{ position?: HyperliquidPosition }>;
};

const DEFAULT_BASE_URL = "https://api.hyperliquid.xyz";

function numberOrUndefined(value: unknown): number | undefined {
	if (value === null || value === undefined || value === "") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrNull(value: unknown): number | null {
	return numberOrUndefined(value) ?? null;
}

function leverageValue(value: HyperliquidPosition["leverage"]): number | undefined {
	if (typeof value === "object" && value) return numberOrUndefined(value.value);
	return numberOrUndefined(value);
}

export function normalizeHyperliquidHoldings(
	wallet: HyperliquidWallet,
	state: HyperliquidClearinghouseState,
): Holding[] {
	const holdings: Holding[] = [];
	const margin =
		numberOrUndefined(state.withdrawable) ??
		numberOrUndefined(state.marginSummary?.accountValue) ??
		numberOrUndefined(state.crossMarginSummary?.accountValue) ??
		0;
	if (margin > 0) {
		holdings.push({
			...wallet,
			asset: "USDC",
			contract: null,
			balance: margin,
			priceUsd: 1,
			valueUsd: Number(margin.toFixed(8)),
			priced: true,
			kind: "spot",
			venue: "hyperliquid",
		});
	}

	for (const entry of state.assetPositions ?? []) {
		const position = entry.position ?? {};
		const signedSize = numberOrUndefined(position.szi) ?? 0;
		if (signedSize === 0) continue;
		const coin = position.coin?.trim();
		if (!coin) continue;
		const holding: Holding = {
			...wallet,
			asset: `${coin}-USD`,
			contract: null,
			balance: Math.abs(signedSize),
			priceUsd: null,
			valueUsd: null,
			priced: false,
			kind: "perp",
			venue: "hyperliquid",
			side: signedSize > 0 ? "long" : "short",
			liquidationPriceUsd: numberOrNull(position.liquidationPx),
			metadata: {
				szi: String(position.szi ?? signedSize),
				positionValue: position.positionValue === undefined ? undefined : String(position.positionValue),
			},
		};
		const leverage = leverageValue(position.leverage);
		const entryPriceUsd = numberOrUndefined(position.entryPx);
		const unrealizedPnlUsd = numberOrUndefined(position.unrealizedPnl);
		if (leverage !== undefined) holding.leverage = leverage;
		if (entryPriceUsd !== undefined) holding.entryPriceUsd = entryPriceUsd;
		if (unrealizedPnlUsd !== undefined) holding.unrealizedPnlUsd = unrealizedPnlUsd;
		holdings.push(holding);
	}
	return holdings;
}

export async function enumerateHyperliquid(
	wallet: HyperliquidWallet,
	deps: HyperliquidEnumeratorDeps = {},
): Promise<EnumerationResult<Holding>> {
	try {
		const fetchImpl = deps.fetch ?? fetch;
		const baseUrl = deps.baseUrl ?? DEFAULT_BASE_URL;
		const response = await fetchImpl(`${baseUrl}/info`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "clearinghouseState", user: wallet.walletAddress }),
		});
		if (!response.ok) {
			return { holdings: [], stale: [{ source: "hyperliquid:info", reason: `http-${response.status}` }] };
		}
		const state = (await response.json()) as HyperliquidClearinghouseState;
		return { holdings: normalizeHyperliquidHoldings(wallet, state), stale: [] };
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: "hyperliquid:info", reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}
