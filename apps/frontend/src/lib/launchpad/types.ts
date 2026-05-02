/**
 * Launchpad shared types (frontend mirror of waifu-core/packages/launchpad/src/types.ts)
 *
 * Authoritative source: W1.A. Until that lands, this file mirrors the locked
 * spec in /home/shad0w/.moltbot/projects/waifu/LAUNCHPAD_WAVE_SPEC.md. Keep in
 * sync with backend changes.
 */

export type LaunchpadId =
	| "four-meme-regular"
	| "four-meme-tax"
	| "flap"
	| "meteora"
	| "pump-fun"
	| "bags"
	| "custom-evm";

export type ChainId = "bsc" | "solana" | "base" | "ethereum";

export type LaunchpadStatus = "live" | "coming-soon" | "deprecated";

export type LaunchpadBadge = "recommended" | "advanced" | "experimental";

export interface LaunchpadDescriptor {
	id: LaunchpadId;
	status: LaunchpadStatus;
	chain: ChainId;
	displayName: string;
	shortDescription: string;
	feeSummary: string;
	graduationTarget: string;
	badges?: LaunchpadBadge[];
	comingSoonNotes?: string;
}

export interface FourMemeRegularFeeConfig {
	kind: "four-meme-regular";
}

export interface FourMemeTaxFeeConfig {
	kind: "four-meme-tax";
	taxBps: 100 | 300 | 500 | 1000;
	/**
	 * Platform cut taken off the top of the tax stream, before the creator's
	 * 4-way allocation. Default DEFAULT_PLATFORM_CUT_BPS (2500 = 25%).
	 */
	platformCutBps: number;
	/**
	 * Creator's split of the post-platform-cut tax stream.
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
	platformCutBps: number;
	recipient: "agent-treasury" | "custom-vault";
	customVaultAddress?: string;
}

export type LaunchpadFeeConfig = FourMemeRegularFeeConfig | FourMemeTaxFeeConfig | FlapFeeConfig;

/**
 * Platform cut: waifu takes a flat percentage of total tax off the top.
 * Default 25%, bounded 10-50% in prod (server-validated).
 */
export const DEFAULT_PLATFORM_CUT_BPS = 2500; // 25%
export const MIN_PLATFORM_CUT_BPS = 1000; // 10%
export const MAX_PLATFORM_CUT_BPS = 5000; // 50%

export const TAX_TIER_BPS: ReadonlyArray<100 | 300 | 500 | 1000> = [100, 300, 500, 1000] as const;
