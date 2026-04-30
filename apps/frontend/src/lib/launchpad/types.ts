/**
 * Launchpad shared types (frontend mirror of waifu-core/packages/launchpad/src/types.ts)
 *
 * Authoritative source: W1.A. Until that lands, this file mirrors the locked
 * spec in /home/shad0w/.moltbot/projects/waifu/LAUNCHPAD_WAVE_SPEC.md. Keep in
 * sync with backend changes.
 */

export type LaunchpadId = "four-meme-regular" | "four-meme-tax" | "flap" | "pump-fun" | "bags" | "custom";

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
	expectedAvailability?: string;
}

export interface FourMemeRegularFeeConfig {
	kind: "four-meme-regular";
}

export interface FourMemeTaxFeeConfig {
	kind: "four-meme-tax";
	taxBps: 100 | 300 | 500 | 1000;
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
	recipient: "agent-treasury" | "custom-vault";
	customVaultAddress?: string;
}

export type LaunchpadFeeConfig = FourMemeRegularFeeConfig | FourMemeTaxFeeConfig | FlapFeeConfig;

/**
 * Platform cut floor: waifu must capture >= 0.5% of trade volume.
 * Computed as (taxBps/10000) * (founderBps/10000) * (PLATFORM_CUT_OF_FOUNDER_BPS/10000).
 */
export const PLATFORM_CUT_OF_FOUNDER_BPS = 2000; // 20% of founder allocation
export const PLATFORM_FLOOR_BPS = 50; // 0.5% of trade volume

export const TAX_TIER_BPS: ReadonlyArray<100 | 300 | 500 | 1000> = [100, 300, 500, 1000] as const;
