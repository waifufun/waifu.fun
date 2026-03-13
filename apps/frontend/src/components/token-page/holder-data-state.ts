import type { IToken } from "@waifufun/types";

export const HOLDER_DATA_UNAVAILABLE_LABEL = "not reported";
export const HOLDER_DATA_UNAVAILABLE_TITLE = "holder indexing unavailable";
export const HOLDER_DATA_UNAVAILABLE_DESCRIPTION =
	"Wallet-level holder rankings are not indexed yet. Aggregate holder totals can still appear when the token payload exposes them, but the wallet leaderboard stays unavailable.";

export function isHolderDataIndexed(_token: IToken) {
	return false;
}

export function hasAggregateHolderCount(token: IToken) {
	return Number.isFinite(token.holders) && token.holders >= 0;
}

export function getHolderCountDisplay(token: IToken) {
	if (hasAggregateHolderCount(token)) {
		return token.holders.toLocaleString();
	}

	if (!isHolderDataIndexed(token)) {
		return HOLDER_DATA_UNAVAILABLE_LABEL;
	}

	return token.holders.toLocaleString();
}
