import type { LaunchpadDescriptor } from "./types";

/**
 * Local mock list of launchpads. Used by use-launchpads hook when
 * GET /v3/launchpads 404s or local development cannot reach the API.
 */
export const MOCK_LAUNCHPADS: LaunchpadDescriptor[] = [
	{
		id: "four-meme-tax",
		status: "live",
		chain: "bsc",
		displayName: "four.meme tax",
		shortDescription: "configurable trade tax that funds the agent's treasury, holders, burn, and LP.",
		feeSummary: "1 / 3 / 5 / 10% trade tax. you split it.",
		graduationTarget: "24 BNB → PancakeSwap V3",
		badges: ["recommended"],
	},
	{
		id: "four-meme-regular",
		status: "live",
		chain: "bsc",
		displayName: "four.meme regular",
		shortDescription: "no creator-side tax. simple bonding curve, no ongoing routing.",
		feeSummary: "1% during curve, 0% post-graduation.",
		graduationTarget: "24 BNB → PancakeSwap V3",
	},
	{
		id: "flap",
		status: "live",
		chain: "bsc",
		displayName: "flap",
		shortDescription: "tax on every trade, curve and post-grad. routes to agent treasury or a custom vault.",
		feeSummary: "configurable tax, curve + post-grad.",
		graduationTarget: "PancakeSwap V3",
		badges: ["advanced"],
	},
	{
		id: "pump-fun",
		status: "coming-soon",
		chain: "solana",
		displayName: "pump.fun",
		shortDescription: "Solana-native curve for creators whose audience already expects the pump.fun route.",
		feeSummary: "platform fee model.",
		graduationTarget: "Raydium",
		expectedAvailability: "Wave 4",
		comingSoonNotes: "Requires Solana wallet adapter, metadata handling, and migration payload support.",
	},
	{
		id: "bags",
		status: "coming-soon",
		chain: "solana",
		displayName: "bags",
		shortDescription: "Solana launch path for creators who want attribution and reward routing in the flow.",
		feeSummary: "creator reward model.",
		graduationTarget: "Meteora DLMM",
		expectedAvailability: "Wave 4",
		comingSoonNotes: "Requires Solana wallet adapter and reward-split UX validation.",
	},
	{
		id: "custom",
		status: "coming-soon",
		chain: "ethereum",
		displayName: "custom",
		shortDescription: "Adapter SDK path for teams bringing their own launch contract or venue.",
		feeSummary: "configured by adapter.",
		graduationTarget: "configurable",
		expectedAvailability: "Wave 5+",
		comingSoonNotes: "Adapter SDK shape is still being designed with early teams.",
	},
];

/** Fixed render order, regardless of API order. */
export const LAUNCHPAD_DISPLAY_ORDER = [
	"four-meme-tax",
	"four-meme-regular",
	"flap",
	"pump-fun",
	"bags",
	"custom",
] as const;
