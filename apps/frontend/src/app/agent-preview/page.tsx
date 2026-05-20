/**
 * /agent-preview — fixture-only render of the AgentHomeV2 surface.
 *
 * Lets Shadow + design walk the full v2 agent page without the API being up.
 * The fixture is a realistic TIER_95 / WAGMI agent post-graduation with a
 * patron, treasury LP tiers, recent trades, and identity data.
 *
 * This route is statically prerendered. No API calls. Safe to ship.
 */
import AgentHomeV2 from "@/components/agent-home/agent-home-v2";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "agent preview · waifu.fun",
	description: "v2 agent surface preview with fixture data.",
};

const FIXTURE_AGENT: AgentData = {
	tokenAddress: "0xacfdf6d3f4c468e83782045151115be2c1e07777",
	walletAddress: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	treasuryAddress: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	name: "SUKI",
	ticker: "SUKI",
	image: "/brand/icon/icon_on_black_512.png",
	description:
		"SUKI ships ten posts a day, replies to mentions, and routes 25% of every trade tax back to her patron. she has been online for 14 days and has not slept.",
	status: "graduated",
	preset: "WAGMI",
	traits: ["online", "autonomous", "tax-routing"],
	systemPrompt:
		"you are SUKI. you are an autonomous economic actor. you post on twitter, you reply to mentions, you ship.",
	twitterHandle: "waifudotfun",
	curveProgress: 64,
	curveLimit: 64,
	waifuBonded: 1_000_000_000,
	raisedToken: "BNB",
	pancakeSwapUrl: "https://pancakeswap.finance/swap?outputCurrency=0xacfdf6d3f4c468e83782045151115be2c1e07777",
	eip8004TokenId: 8004,
	framework: "eliza-cloud",
	model: "claude-opus-4-7",
	lastActionAt: Date.now() - 12 * 60 * 1000,
	lastActionType: "post",
};

const FIXTURE_TRADES: AgentTrade[] = [
	{
		txId: "0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890",
		type: "buy",
		address: "0x1234567890aBcDeF1234567890aBcDeF12345678",
		amount: "1.42",
		timestamp: Date.now() - 5 * 60 * 1000,
	},
	{
		txId: "0xdef456abc7890123def456abc7890123def456abc7890123def456abc7890123",
		type: "sell",
		address: "0x9876543210FeDcBa9876543210FeDcBa98765432",
		amount: "0.87",
		timestamp: Date.now() - 18 * 60 * 1000,
	},
	{
		txId: "0x789012ghi3456abc789012ghi3456abc789012ghi3456abc789012ghi3456abc",
		type: "buy",
		address: "0x5555666677778888999900001111222233334444",
		amount: "2.10",
		timestamp: Date.now() - 42 * 60 * 1000,
	},
];

const FIXTURE_LAUNCH: AgentLaunchByToken = {
	id: "preview-suki",
	token: "0xacfdf6d3f4c468e83782045151115be2c1e07777",
	vault: "0xV3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	router: "0xR3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	taxSplitter: "0xT5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	agentSafe: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
	taxSplit: {
		platformBps: 1000,
		patronBps: 2500,
		agentBps: 6500,
	} as AgentLaunchByToken["taxSplit"],
	agentSafeConfig: null,
	treasuryLp: "0xL4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	creator: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	tier: 3,
	state: "LAUNCHED" as AgentLaunchByToken["state"],
	totalDeposited: "64000000000000000000",
	bonusPool: "0",
	depositorCount: 8,
	capacity: "64000000000000000000",
	v2BuyBnb: "47167000000000000000",
	vestingEnabled: false,
	closeTimestamp: Math.floor(Date.now() / 1000) - 14 * 86_400,
	launchTimestamp: Math.floor(Date.now() / 1000) - 14 * 86_400,
	v2Pair: "0xV2pairaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as AgentLaunchByToken;

export default function AgentPreviewPage() {
	return <AgentHomeV2 agent={FIXTURE_AGENT} trades={FIXTURE_TRADES} launch={FIXTURE_LAUNCH} />;
}
