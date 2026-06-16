import { type HlClearinghouseState, type HlPosition, fetchAllHlState } from "../../hyperliquid/builder-dexs.js";
import type { EnumerationResult, Holding } from "../types.js";

type HyperliquidWallet = Pick<Holding, "walletId" | "walletAddress" | "walletLabel" | "walletRole" | "chain">;

export type HyperliquidEnumeratorDeps = {
	fetch?: typeof fetch;
	baseUrl?: string;
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

function leverageValue(value: HlPosition["leverage"]): number | undefined {
	if (typeof value === "object" && value) return numberOrUndefined(value.value);
	return numberOrUndefined(value);
}

export function normalizeHyperliquidHoldings(
	wallet: HyperliquidWallet,
	state: HlClearinghouseState,
	options: { dex?: string; builderPerp?: boolean; accountAsset?: string } = {},
): Holding[] {
	const holdings: Holding[] = [];
	// HL account equity. marginSummary.accountValue is the FULL equity of the
	// hyperliquid account: free collateral + margin locked into open perps +
	// unrealized pnl. This is the number the HL UI prints as "account value".
	//
	// We previously valued this line at `withdrawable` (free collateral only),
	// which undercounted the venue badly: an account with $965 free + $699
	// locked margin + position equity read as ~$965 in NAV instead of ~$1,961,
	// and every open perp showed up `unpriced`. accountValue already folds the
	// margin-locked equity AND unrealized pnl into one number, so valuing the
	// single account line at accountValue (and leaving the per-perp rows
	// `valueUsd: null` below as DETAIL only) makes NAV correct with NO
	// double-count. withdrawable is surfaced separately for the health strip.
	const accountValue =
		numberOrUndefined(state.marginSummary?.accountValue) ??
		numberOrUndefined(state.crossMarginSummary?.accountValue) ??
		numberOrUndefined(state.withdrawable) ??
		0;
	const withdrawable = numberOrUndefined(state.withdrawable) ?? null;
	if (accountValue > 0) {
		const account: Holding = {
			...wallet,
			asset: options.accountAsset ?? "USDC",
			contract: null,
			balance: accountValue,
			priceUsd: 1,
			valueUsd: Number(accountValue.toFixed(8)),
			priced: true,
			kind: "spot",
			venue: "hyperliquid",
			metadata: {
				accountValueUsd: accountValue,
				// Free (withdrawable) collateral, distinct from the locked margin
				// folded into accountValue. The FE reads this off the account line
				// to render "withdrawable" without a second endpoint round-trip.
				withdrawableUsd: withdrawable,
				dex: options.dex,
				builderPerp: options.builderPerp || undefined,
			},
		};
		holdings.push(account);
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
				dex: options.dex,
				builderPerp: options.builderPerp || undefined,
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
		const state = await fetchAllHlState(wallet.walletAddress, fetchImpl, { baseUrl });
		if (!state.core) {
			return { holdings: [], stale: [{ source: "hyperliquid:info", reason: "empty-core-state" }] };
		}
		const holdings = [
			...normalizeHyperliquidHoldings(wallet, state.core),
			...state.builderDexs.flatMap(({ dex, state: dexState }) =>
				normalizeHyperliquidHoldings(wallet, dexState, {
					dex,
					builderPerp: true,
					accountAsset: `${dex}:USDC`,
				}),
			),
		];
		return { holdings, stale: [] };
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: "hyperliquid:info", reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}
