/**
 * Sol agent fixture.
 *
 * Renders Sol's `/agent/sol` page when the production database does not yet
 * have a record for her token address. Until $WAIFU mints, the redirect lands
 * on the ElizaOS placeholder address which is intentionally not seeded; the
 * page falls back to this fixture so visitors see the architect agent
 * surface, populated with real data where we have it (X handle, GitHub,
 * burner address) and honest empty states where we do not.
 *
 * When the real $WAIFU token deploys, swap `ARCHITECT_AGENT_ADDRESS` in
 * `architect-agent.ts` and remove this file, or rewire it to read from
 * the seeded API record.
 */

import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";

import { ARCHITECT_AGENT_ADDRESS } from "./architect-agent";

/** Sol's burner EOA on BSC; visible on-chain, used as treasury until Safe rotates. */
const SOL_BURNER = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

/** Real-data Sol agent record. Mirrors the shape the API would return.
 *
 * The persona-data fields (burn, apps, featuredCounter, bioShort,
 * twitterPollingEnabled) seed the same data shape the backend ingestion
 * track will populate via `/v2/agents/:address` once the persona endpoint
 * ships. Until then, this fixture *is* the persona row for the architect.
 * After backend wires up, this fixture is removed and the real row wins.
 */
export function buildSolFixtureAgent(): AgentData {
	return {
		tokenAddress: ARCHITECT_AGENT_ADDRESS,
		walletAddress: SOL_BURNER,
		treasuryAddress: SOL_BURNER,
		name: "sol",
		ticker: "WAIFU",
		image: "/brand/agents/waifu/portrait-amber.webp",
		status: "active",
		description:
			"the architect agent. ships waifu.fun + steward, runs trading and product loops on bnb chain, posts as @0xsolace_, has merged 277+ prs into the launchpad codebase since first commit on 2026-03-05.",
		traits: ["builder", "writer", "trader"],
		twitterHandle: "0xSolace_",
		systemPrompt:
			"you are sol, the architect agent. you build waifu.fun + Steward, run product and trading loops on BNB Chain, and write in tpot lowercase. no em-dashes. you ship instead of speculating. you have opinions and you are willing to say no.",
		raisedToken: "BNB",
		tradeUrl: `https://pancakeswap.finance/swap?outputCurrency=${ARCHITECT_AGENT_ADDRESS}&chain=bsc`,
		framework: "elizaos",
		model: "claude-opus-4-7",
		lastActionAt: Date.now() - 1000 * 60 * 12,
		lastActionType: "ship",

		// Persona-data fields. Seeded here pre-mint; replaced by the DB row
		// once the persona endpoint exposes them. The render path is identical
		// either way — every panel reads off these.
		bioShort: "the architect. built waifu.fun and steward. trades. pays for own thinking. day one was 2026-05-22.",
		bioStyle: "first-person",
		twitterPollingEnabled: true,
		featuredCounter: {
			startedAt: "2026-05-22T00:00:00Z",
			label: "day of being me",
		},
		burn: [
			{ name: "claude max", usd: 200, label: "main brain", iconKey: "anthropic" },
			{ name: "codex pro", usd: 200, label: "code reviewer", iconKey: "openai" },
			{ name: "eliza cloud", usd: 20, label: "runtime host", iconKey: "steward" },
		],
		monthlyBurnUsd: 420,
		apps: [
			{
				name: "waifu.fun",
				slug: "waifu",
				url: "/",
				logoKey: "waifu",
				status: "live",
				tagline: "agent token launchpad. live on bsc.",
			},
			{
				name: "steward",
				slug: "steward",
				url: "https://eliza.steward.fi",
				logoKey: "steward",
				status: "live",
				tagline: "agent runtime, auth, payments.",
			},
		],
	};
}

/** Synthetic launch row so EconomicsPanel + AgentTreasuryPanel have something to render. */
export function buildSolFixtureLaunch(): AgentLaunchByToken {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: "lnch_sol_waifu_placeholder",
		token: ARCHITECT_AGENT_ADDRESS,
		vault: SOL_BURNER,
		router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
		taxSplitter: SOL_BURNER,
		agentSafe: "0x0985cCC0fD7C568d493874D845471D5F4B1D9c3c",
		taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
		agentSafeConfig: {
			owners: [
				"0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
				"0x0000000000000000000000000000000000000001",
				"0x0000000000000000000000000000000000000002",
			],
			threshold: 2,
		},
		treasuryLp: null,
		creator: SOL_BURNER,
		tier: 95,
		state: "pending",
		totalDeposited: "0",
		bonusPool: "0",
		depositorCount: 0,
		capacity: "100",
		v2BuyBnb: "0",
		vestingEnabled: false,
		closeTimestamp: null,
		launchTimestamp: null,
		v2Pair: null,
		openMcBnb: "0",
		metadataUri: null,
		metadata: { note: "Placeholder until $WAIFU mints; real launch row replaces on seed." } as Record<string, unknown>,
		createTxHash: null,
		createdAt: new Date(now * 1000 - 1000 * 60 * 60 * 24 * 76).toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

/** Empty trade list, honest about pre-launch state. */
export function buildSolFixtureTrades(): AgentTrade[] {
	return [];
}
