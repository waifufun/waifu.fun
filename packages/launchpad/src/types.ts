export type LaunchpadId = "four-meme-regular" | "four-meme-tax" | "flap" | "pump-fun" | "bags" | "custom";

export type ChainId = "bsc" | "solana" | "base" | "ethereum";

export type LaunchpadStatus = "live" | "coming-soon" | "deprecated";

export interface LaunchpadDescriptor {
	id: LaunchpadId;
	status: LaunchpadStatus;
	chain: ChainId;
	displayName: string;
	shortDescription: string;
	feeSummary: string;
	graduationTarget: string;
	badges?: ("recommended" | "advanced" | "experimental")[];
	comingSoonNotes?: string;
	expectedAvailability?: string;
}

export type LaunchpadFeeConfig = FourMemeRegularFeeConfig | FourMemeTaxFeeConfig | FlapFeeConfig;

export interface FourMemeRegularFeeConfig {
	kind: "four-meme-regular";
}

export interface FourMemeTaxFeeConfig {
	kind: "four-meme-tax";
	taxBps: 100 | 300 | 500 | 1000;
	/**
	 * Platform cut taken off the top of the tax stream, before the creator's
	 * 4-way allocation. Defaults to WAIFU_PLATFORM_CUT_BPS env var (1000 = 10%).
	 * Bounded by MIN_PLATFORM_CUT_BPS (default 1000) and MAX_PLATFORM_CUT_BPS
	 * (default 5000) at validation time.
	 */
	platformCutBps: number;
	/**
	 * Creator's 4-way split of the post-platform-cut tax stream.
	 * Must sum to (10000 - platformCutBps).
	 */
	allocation: {
		founderBps: number;
		holderBps: number;
		burnBps: number;
		liquidityBps: number;
	};
	minHolderBalance: string;
}

export interface FlapFeeConfig {
	kind: "flap";
	taxBps: 100 | 300 | 500 | 1000;
	/** Platform cut, see FourMemeTaxFeeConfig.platformCutBps. */
	platformCutBps: number;
	recipient: "agent-treasury" | "custom-vault";
	customVaultAddress?: string;
}

export interface LaunchpadAdapter {
	descriptor: LaunchpadDescriptor;

	getDefaultFeeConfig(): LaunchpadFeeConfig;
	validateFeeConfig(c: LaunchpadFeeConfig, env: "prod" | "dev"): { ok: boolean; errors: string[] };

	buildCreateTokenTx(params: CreateTokenParams): Promise<UnsignedTx>;
	parseCreateTokenReceipt(receipt: any): {
		tokenAddress: string;
		curveAddress: string;
		vaultAddress?: string;
		vaultFactory?: string;
	};

	getCurveProgress(tokenAddress: string): Promise<{ raisedWei: bigint; targetWei: bigint }>;
	getGraduationStatus(tokenAddress: string): Promise<{ graduated: boolean; lpAddress?: string }>;
	getTradeFeeBps(tokenAddress: string, phase: "curve" | "post-grad"): Promise<number>;
	getTreasuryAddress(tokenAddress: string): Promise<string | null>;

	buildClaimDividendsTx?(tokenAddress: string, holder: string): Promise<UnsignedTx>;
}

export interface CreateTokenParams {
	name: string;
	ticker: string;
	description: string;
	logoUrl: string;
	socials?: { twitter?: string; telegram?: string; website?: string };
	feeConfig: LaunchpadFeeConfig;
	founderAddress: string;
	initialBuyWei?: bigint;
}

export interface UnsignedTx {
	to: string;
	data: `0x${string}`;
	value: bigint;
	chainId: number;
}
