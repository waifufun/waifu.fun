import type { LaunchpadDescriptor } from "./types";

/**
 * Local mock list of launchpads. Used by use-launchpads hook when
 * GET /v3/launchpads 404s (i.e. before W1.A merges).
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
		shortDescription: "solana's largest launchpad. requires solana wallet integration.",
		feeSummary: "1% trade fee.",
		graduationTarget: "Raydium",
		expectedAvailability: "Wave 4",
		comingSoonNotes: "needs solana wallet adapter and cross-chain agent migration.",
	},
	{
		id: "bags",
		status: "coming-soon",
		chain: "solana",
		displayName: "bags",
		shortDescription: "creator-rewarded launchpad on solana with revenue splits.",
		feeSummary: "split fee model.",
		graduationTarget: "Meteora DLMM",
		expectedAvailability: "Wave 4",
		comingSoonNotes: "needs solana wallet adapter.",
	},
	{
		id: "custom",
		status: "coming-soon",
		chain: "ethereum",
		displayName: "custom",
		shortDescription: "bring your own launchpad contract via the adapter SDK.",
		feeSummary: "you define it.",
		graduationTarget: "configurable",
		expectedAvailability: "Wave 5+",
		comingSoonNotes: "adapter SDK still in design.",
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
