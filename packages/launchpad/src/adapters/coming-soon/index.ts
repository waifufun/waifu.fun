import type {
	CreateTokenParams,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
	LaunchpadId,
	UnsignedTx,
} from "../../types.js";

const comingSoon = async (): Promise<never> => {
	throw new Error("coming soon");
};

export const createComingSoonAdapter = (descriptor: LaunchpadDescriptor): LaunchpadAdapter => ({
	descriptor,
	getDefaultFeeConfig(): LaunchpadFeeConfig {
		throw new Error("coming soon");
	},
	validateFeeConfig(): { ok: boolean; errors: string[] } {
		return { ok: false, errors: ["coming soon"] };
	},
	buildCreateTokenTx(_params: CreateTokenParams): Promise<UnsignedTx> {
		return comingSoon();
	},
	parseCreateTokenReceipt(): { tokenAddress: string; curveAddress: string } {
		throw new Error("coming soon");
	},
	getCurveProgress(): Promise<{ raisedWei: bigint; targetWei: bigint }> {
		return comingSoon();
	},
	getGraduationStatus(): Promise<{ graduated: boolean; lpAddress?: string }> {
		return comingSoon();
	},
	getTradeFeeBps(): Promise<number> {
		return comingSoon();
	},
	getTreasuryAddress(): Promise<string | null> {
		return comingSoon();
	},
});

const descriptors: Record<Extract<LaunchpadId, "pump-fun" | "custom">, LaunchpadDescriptor> = {
	"pump-fun": {
		id: "pump-fun",
		status: "coming-soon",
		chain: "solana",
		displayName: "pump.fun",
		shortDescription: "Solana meme launchpad support.",
		feeSummary: "TBD when pump.fun adapter ships.",
		graduationTarget: "Pump.fun graduation to Solana DEX liquidity.",
		comingSoonNotes: "Deferred to Wave 4+ with Solana wallet integration.",
		expectedAvailability: "Wave 4+",
	},
	custom: {
		id: "custom",
		status: "coming-soon",
		chain: "ethereum",
		displayName: "Custom launchpad",
		shortDescription: "Bring-your-own launchpad integration.",
		feeSummary: "Configured per custom integration.",
		graduationTarget: "Configured per custom integration.",
		badges: ["experimental"],
		comingSoonNotes: "Deferred until custom launchpad SDK is defined.",
		expectedAvailability: "Wave 4+",
	},
};

export const comingSoonAdapters = Object.values(descriptors).map(createComingSoonAdapter);
