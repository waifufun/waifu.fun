import type { IToken } from "@waifufun/types";

export const HOLDER_DATA_UNAVAILABLE_LABEL = "not indexed";
export const HOLDER_DATA_UNAVAILABLE_TITLE = "holder indexing unavailable";
export const HOLDER_DATA_UNAVAILABLE_DESCRIPTION =
	"Wallet-level holder rankings are not indexed yet, so we hide holder counts and the leaderboard instead of showing placeholder data.";

export function isHolderDataIndexed(_token: IToken) {
	return false;
}

export function getHolderCountDisplay(token: IToken) {
	if (!isHolderDataIndexed(token)) {
		return HOLDER_DATA_UNAVAILABLE_LABEL;
	}

	return token.holders.toLocaleString();
}
