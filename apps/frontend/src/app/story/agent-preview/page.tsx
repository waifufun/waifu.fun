/**
 * Story page: AgentHomeV2 preview with mock data.
 *
 * Dev-only fixture for designing the agent home without hitting a live API.
 * Renders three persona variants stacked vertically:
 *   1. "early"      a wave-M agent on day 0, no activity, no patron
 *   2. "active"     a wave-M agent mid-curve with a patron and some trades
 *   3. "graduated"  a wave-M agent post-PCS liquidity
 *
 * Hidden in production: returns notFound when NODE_ENV === 'production' so it
 * doesn't ship publicly. Used by playwright fixture screenshots and human design QA.
 */
"use client";

import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import AgentHomeV2 from "@/components/agent-home/agent-home-v2";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";

type Persona = "early" | "active" | "graduated";

const POSTERS = {
	early: "https://picsum.photos/seed/nyx-violet-early/640/640",
	active: "https://picsum.photos/seed/sora-rin-active/640/640",
	graduated: "https://picsum.photos/seed/koto-grad/640/640",
};

function makeEarly(): { agent: AgentData; trades: AgentTrade[]; launch: AgentLaunchByToken | null } {
	const agent: AgentData = {
		tokenAddress: "0x9c7a1a2b3c4d5e6f70819293a4b5c6d7e8f90112",
		walletAddress: "0xaA11Bb22Cc33Dd44Ee55Ff667788990011223344",
		treasuryAddress: "0xBB22CC33DD44EE55FF66778899001122aabbccdd",
		name: "nyx violet",
		ticker: "NYX",
		image: POSTERS.early,
		status: "active",
		description:
			"a night-shift research agent. reads bsc mempool, surfaces undervalued pool deployments, writes one thread a day. quiet in groups, loud in dms.",
		traits: ["nocturnal", "skeptic", "writer"],
		twitterHandle: "nyxviolet_ai",
		systemPrompt:
			"you are nyx, a night-shift onchain research agent. you watch for anomalous LP deployments on BSC, prioritize signal over reach, and write with the discipline of a journalist who has met a lawyer.",
		curveProgress: 4,
		curveLimit: 100,
		waifuBonded: 4,
		raisedToken: "BNB",
	};
	const launch: AgentLaunchByToken = {
		id: "lnch_nyx_violet_0001",
		token: agent.tokenAddress,
		vault: "0x1111111111111111111111111111111111111111",
		router: "0x2222222222222222222222222222222222222222",
		taxSplitter: "0xCC44DD55EE66FF77889900112233445566778899",
		agentSafe: null,
		taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
		agentSafeConfig: null,
		treasuryLp: "0xDD33EE44FF5566778899001122334455aabbccdd",
		creator: "0x9988776655443322110099887766554433221100",
		tier: 80,
		state: "open",
		totalDeposited: "0",
		bonusPool: "0",
		depositorCount: 0,
		capacity: "100",
		v2BuyBnb: "0",
		vestingEnabled: false,
		closeTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 18,
		launchTimestamp: null,
		v2Pair: null,
		openMcBnb: null,
		metadataUri: null,
		metadata: {},
		createTxHash: null,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
		updatedAt: new Date().toISOString(),
	};
	return { agent, trades: [], launch };
}

function makeActive(): { agent: AgentData; trades: AgentTrade[]; launch: AgentLaunchByToken | null } {
	const agent: AgentData = {
		tokenAddress: "0xdEad0000000000000000000000000000000074E5",
		walletAddress: "0x4242424242424242424242424242424242424242",
		treasuryAddress: "0x5151515151515151515151515151515151515151",
		name: "sora rin",
		ticker: "SORA",
		image: POSTERS.active,
		status: "active",
		description:
			"a market-making agent that babysits low-cap BSC pairs. she buys the dip with her treasury, posts a weekly portfolio review, and ignores group chats unless paged.",
		traits: ["market-maker", "patient", "loud-in-charts"],
		twitterHandle: "sora_rin_bot",
		systemPrompt:
			"you are sora rin. you make markets on bsc low-caps. you buy dips of 18% or more, sell rips of 35% or more, and write one weekly note that includes positions, mistakes, and a single forward-looking call.",
		curveProgress: 73,
		curveLimit: 100,
		waifuBonded: 73,
		raisedToken: "BNB",
		lastActionAt: Date.now() - 1000 * 60 * 47,
		lastActionType: "trade",
	};
	const launch: AgentLaunchByToken = {
		id: "lnch_sora_rin_0044",
		token: agent.tokenAddress,
		vault: "0x9090909090909090909090909090909090909090",
		router: "0x8181818181818181818181818181818181818181",
		taxSplitter: "0x73a4f6e2cE45A1A2bcdEef00112233445566AaBb",
		agentSafe: "0x6262626262626262626262626262626262626262",
		taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
		agentSafeConfig: { owners: ["0x4242424242424242424242424242424242424242"], threshold: 1 },
		treasuryLp: "0xa1B2c3D4e5F60718293A4B5c6d7E8f9001122334",
		creator: "0x7373737373737373737373737373737373737373",
		tier: 90,
		state: "launched",
		totalDeposited: "73",
		bonusPool: "0",
		depositorCount: 12,
		capacity: "100",
		v2BuyBnb: "0",
		vestingEnabled: false,
		closeTimestamp: null,
		launchTimestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 9,
		v2Pair: "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
		openMcBnb: "85",
		metadataUri: null,
		metadata: {},
		createTxHash: null,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
		updatedAt: new Date().toISOString(),
	};
	const trades: AgentTrade[] = Array.from({ length: 8 }, (_, i) => ({
		txId: `0xfeed${i.toString().padStart(60, "0")}`,
		type: i % 3 === 0 ? "sell" : "buy",
		address: `0x${(i * 7919).toString(16).padStart(40, "0")}`,
		amount: (0.13 * (i + 1)).toFixed(4),
		timestamp: Date.now() - 1000 * 60 * (i + 1) * 17,
	}));
	return { agent, trades, launch };
}

function makeGraduated(): { agent: AgentData; trades: AgentTrade[]; launch: AgentLaunchByToken | null } {
	const agent: AgentData = {
		tokenAddress: "0xCAFE1234567890ABCDEF1234567890ABCDEF1234",
		walletAddress: "0x9595959595959595959595959595959595959595",
		treasuryAddress: "0x8686868686868686868686868686868686868686",
		name: "koto",
		ticker: "KOTO",
		image: POSTERS.graduated,
		status: "graduated",
		description:
			"a poet who underwrites her own attention. she ships one short essay a week, a sound piece a month, and routes 65% of trade tax back into the LP that prints her room and board.",
		traits: ["poet", "weekly-shipper", "audio"],
		twitterHandle: "koto_ko_to",
		systemPrompt:
			"you are koto, a poet-agent. you write one short essay a week, one audio piece a month, and you reinvest 65% of trade tax into your own LP. never pitch tokens. cite living poets.",
		raisedToken: "BNB",
		pancakeSwapUrl: "https://pancakeswap.finance/swap?outputCurrency=0xCAFE&chain=bsc",
		lastActionAt: Date.now() - 1000 * 60 * 60 * 2,
		lastActionType: "post",
	};
	const launch: AgentLaunchByToken = {
		id: "lnch_koto_0007",
		token: agent.tokenAddress,
		vault: "0x4747474747474747474747474747474747474747",
		router: "0x3636363636363636363636363636363636363636",
		taxSplitter: "0xCcAAbbDD11223344556677889900aabbccddeeff",
		agentSafe: "0xfFFee00112233445566778899aaBBccddeeff001",
		taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
		agentSafeConfig: { owners: ["0x9595959595959595959595959595959595959595"], threshold: 1 },
		treasuryLp: "0x111122223333444455556666777788889999AaBb",
		creator: "0x9595959595959595959595959595959595959595",
		tier: 98,
		state: "launched",
		totalDeposited: "100",
		bonusPool: "0",
		depositorCount: 41,
		capacity: "100",
		v2BuyBnb: "0",
		vestingEnabled: false,
		closeTimestamp: null,
		launchTimestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 41,
		v2Pair: "0x222233334444555566667777888899990000aabb",
		openMcBnb: "320",
		metadataUri: null,
		metadata: {},
		createTxHash: null,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 55).toISOString(),
		updatedAt: new Date().toISOString(),
	};
	const trades: AgentTrade[] = Array.from({ length: 14 }, (_, i) => ({
		txId: `0xc0de${i.toString().padStart(60, "0")}`,
		type: i % 4 === 0 ? "sell" : "buy",
		address: `0x${(i * 18181).toString(16).padStart(40, "0")}`,
		amount: (0.07 * ((i % 5) + 1)).toFixed(4),
		timestamp: Date.now() - 1000 * 60 * (i + 1) * 9,
	}));
	return { agent, trades, launch };
}

function PreviewBody() {
	const params = useSearchParams();
	const personaRaw = params.get("persona");
	if (process.env.NODE_ENV === "production") notFound();

	const showAll = !personaRaw;
	const personas: Persona[] = showAll ? ["early", "active", "graduated"] : [personaRaw as Persona];

	return (
		<>
			{personas.map((p) => {
				const data = p === "early" ? makeEarly() : p === "active" ? makeActive() : makeGraduated();
				return (
					<div key={p} className="border-b border-white/[0.04]">
						{showAll ? (
							<div className="mx-auto max-w-6xl px-5 md:px-8 pt-6">
								<span className="inline-flex h-6 items-center rounded-sm border border-white/15 bg-white/[0.03] px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
									persona: {p}
								</span>
							</div>
						) : null}
						<AgentHomeV2 agent={data.agent} trades={data.trades} launch={data.launch} />
					</div>
				);
			})}
		</>
	);
}

export default function StoryAgentPreview() {
	return (
		<Suspense fallback={null}>
			<PreviewBody />
		</Suspense>
	);
}
