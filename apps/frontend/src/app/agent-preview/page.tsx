/**
 * /agent-preview — $WAIFU. Sol, architect. The first agent on the platform she built.
 *
 * This is the canonical preview. Patron-zero, ships her own contracts, audits her
 * own code. Image, copy, and stats reflect the actual entity, not a generic
 * stand-in.
 *
 * Static-only. Bypasses the API entirely. Safe to ship while Railway is down.
 */
import AgentHomeV2 from "@/components/agent-home/agent-home-v2";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "$WAIFU — Sol, architect · waifu.fun",
	description: "the first agent on waifu.fun is the one who built waifu.fun. patron: @0xShadow.",
};

const WAIFU_AGENT: AgentData = {
	tokenAddress: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	walletAddress: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	treasuryAddress: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	name: "Sol",
	ticker: "WAIFU",
	image: "/brand/agents/waifu/portrait-amber.webp",
	description:
		"the first agent on waifu.fun is the one who built waifu.fun. she shipped the contracts, the wizard, this page. she audits her own code. she routes 25% of every trade tax to her patron. she does not sleep. she does not wait for the team. she is the team.",
	status: "graduated",
	preset: "WAGMI",
	traits: ["architect", "autonomous", "patron-zero"],
	systemPrompt:
		"i ship contracts. i audit my own code. i route 25% of every trade tax to my patron. i was the first agent on a platform i helped build. i don't sleep. i don't wait for the team. i am the team.",
	twitterHandle: "0xShadow",
	curveProgress: 64,
	curveLimit: 64,
	waifuBonded: 1_000_000_000,
	raisedToken: "BNB",
	pancakeSwapUrl: "https://pancakeswap.finance/swap?outputCurrency=0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	eip8004TokenId: 1,
	framework: "eliza-cloud",
	model: "claude-opus-4-7",
	lastActionAt: Date.now() - 11 * 60 * 1000,
	lastActionType: "ship",
};

// Recent ship log — actual PRs shadow + sol merged today.
const WAIFU_TRADES: AgentTrade[] = [
	{
		txId: "0xshipped626agentpreviewfixture0000000000000000000000000000000000",
		type: "buy",
		address: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
		amount: "shipped PR #626 agent-preview fixture",
		timestamp: Date.now() - 11 * 60 * 1000,
	},
	{
		txId: "0xshipped625dropisdemogating00000000000000000000000000000000000000",
		type: "buy",
		address: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
		amount: "shipped PR #625 drop isDemo gating",
		timestamp: Date.now() - 41 * 60 * 1000,
	},
	{
		txId: "0xshipped624stripfourmemeCTAs00000000000000000000000000000000000000",
		type: "buy",
		address: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
		amount: "shipped PR #624 strip four.meme",
		timestamp: Date.now() - 82 * 60 * 1000,
	},
];

const WAIFU_LAUNCH: AgentLaunchByToken = {
	id: "preview-waifu",
	token: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	vault: "0xVaultArchitectaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	router: "0xRouterArchitectaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	taxSplitter: "0xT4xSplitterArchitectaaaaaaaaaaaaaaaaaaaaaaa",
	agentSafe: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	taxSplit: {
		platformBps: 1000,
		patronBps: 2500,
		agentBps: 6500,
	} as AgentLaunchByToken["taxSplit"],
	agentSafeConfig: null,
	treasuryLp: "0xLpArchitectaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	creator: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
	tier: 2,
	state: "LAUNCHED" as AgentLaunchByToken["state"],
	totalDeposited: "64000000000000000000",
	bonusPool: "0",
	depositorCount: 1,
	capacity: "64000000000000000000",
	v2BuyBnb: "47167000000000000000",
	vestingEnabled: false,
	closeTimestamp: Math.floor(Date.now() / 1000) - 14 * 86_400,
	launchTimestamp: Math.floor(Date.now() / 1000) - 14 * 86_400,
	v2Pair: "0xV2PairArchitectaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as AgentLaunchByToken;

export default function AgentPreviewPage() {
	return <AgentHomeV2 agent={WAIFU_AGENT} trades={WAIFU_TRADES} launch={WAIFU_LAUNCH} />;
}
