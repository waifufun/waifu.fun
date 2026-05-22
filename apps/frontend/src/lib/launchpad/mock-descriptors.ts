import type { LaunchpadDescriptor } from "./types";

/**
 * Local mock list of launchpads. Used by use-launchpads hook when the
 * backend launchpad endpoint is unreachable or in local development.
 */
export const MOCK_LAUNCHPADS: LaunchpadDescriptor[] = [
	{
		id: "flap",
		status: "live",
		chain: "bsc",
		displayName: "flap",
		shortDescription: "tax on every trade, curve and post-grad. routes to agent treasury or a custom vault.",
		feeSummary: "configurable tax, curve + post-grad.",
		graduationTarget: "PancakeSwap V3",
		badges: ["recommended"],
	},
	{
		id: "four-meme-tax",
		status: "coming-soon",
		chain: "bsc",
		displayName: "four.meme tax",
		shortDescription: "configurable trade tax that funds the agent's treasury, holders, burn, and LP.",
		feeSummary: "1 / 3 / 5 / 10% trade tax. you split it.",
		graduationTarget: "24 BNB → PancakeSwap V3",
		comingSoonNotes: "parallel four.meme route paused while FLAP is the primary launch rail.",
	},
	{
		id: "four-meme-regular",
		status: "coming-soon",
		chain: "bsc",
		displayName: "four.meme regular",
		shortDescription: "no creator-side tax. simple bonding curve, no ongoing routing.",
		feeSummary: "1% during curve, 0% post-graduation.",
		graduationTarget: "24 BNB → PancakeSwap V3",
		comingSoonNotes: "parallel four.meme route paused while FLAP is the primary launch rail.",
	},
	{
		id: "meteora",
		status: "coming-soon",
		chain: "solana",
		displayName: "meteora",
		shortDescription: "solana DLMM-native launch path with concentrated liquidity from day one.",
		feeSummary: "DLMM bin fees, configurable.",
		graduationTarget: "Meteora DLMM (native).",
		comingSoonNotes: "needs solana wallet adapter and meteora SDK integration.",
	},
	{
		id: "pump-fun",
		status: "coming-soon",
		chain: "solana",
		displayName: "pump.fun",
		shortDescription: "solana-native curve for creators whose audience already expects the pump.fun route.",
		feeSummary: "platform fee model.",
		graduationTarget: "Raydium",
		comingSoonNotes: "needs solana wallet adapter, metadata handling, and migration payload support.",
	},
	{
		id: "bags",
		status: "coming-soon",
		chain: "solana",
		displayName: "bags",
		shortDescription: "solana launch path for creators who want attribution and reward routing in the flow.",
		feeSummary: "creator reward model.",
		graduationTarget: "Meteora DLMM",
		comingSoonNotes: "needs solana wallet adapter and reward-split UX validation.",
	},
	{
		id: "custom-evm",
		status: "coming-soon",
		chain: "ethereum",
		displayName: "custom evm",
		shortDescription: "bring your own EVM launch contract or venue. adapter SDK.",
		feeSummary: "configured by adapter.",
		graduationTarget: "configurable.",
		comingSoonNotes: "adapter SDK shape is being designed with early teams.",
	},
];

/** Fixed render order, regardless of API order. */
export const LAUNCHPAD_DISPLAY_ORDER = [
	"flap",
	"four-meme-tax",
	"four-meme-regular",
	"meteora",
	"pump-fun",
	"bags",
	"custom-evm",
] as const;
