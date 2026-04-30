import type {
	FlapFeeConfig,
	FourMemeRegularFeeConfig,
	FourMemeTaxFeeConfig,
	LaunchpadFeeConfig,
	LaunchpadId,
} from "./types";

export const DEFAULT_FOUR_MEME_TAX: FourMemeTaxFeeConfig = {
	kind: "four-meme-tax",
	taxBps: 300,
	allocation: {
		founderBps: 4000,
		holderBps: 3000,
		burnBps: 1500,
		liquidityBps: 1500,
	},
	minHolderBalance: "10000",
};

export const DEFAULT_FOUR_MEME_REGULAR: FourMemeRegularFeeConfig = {
	kind: "four-meme-regular",
};

export const DEFAULT_FLAP: FlapFeeConfig = {
	kind: "flap",
	taxBps: 300,
	recipient: "agent-treasury",
};

export function getDefaultFeeConfig(id: LaunchpadId): LaunchpadFeeConfig | null {
	switch (id) {
		case "four-meme-tax":
			return DEFAULT_FOUR_MEME_TAX;
		case "four-meme-regular":
			return DEFAULT_FOUR_MEME_REGULAR;
		case "flap":
			return DEFAULT_FLAP;
		default:
			return null;
	}
}
