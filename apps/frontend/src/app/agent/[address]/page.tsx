import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AgentHome from "@/components/agent-home/agent-home";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

async function fetchAgent(address: string): Promise<AgentData | null> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}`, {
			next: { revalidate: 30 },
		});
		if (res.ok) return (await res.json()) as AgentData;
	} catch (e) {
		console.error("agent fetch failed", e);
	}

	// fallback: hit the legacy token endpoint and shape it into an agent
	try {
		const res = await fetch(`${API_BASE}/tokens/bsc/56/${address}`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const token = await res.json();
		const shaped: AgentData = {
			tokenAddress: token.contractAddress,
			walletAddress: token.creator,
			treasuryAddress: token.bondingCurveAddress,
			name: token.name,
			ticker: token.ticker,
			image: token.image,
			description: token.description,
			status:
				token.status === "migrated" || token.status === "locked"
					? "graduated"
					: "active",
			curveProgress: token.curveProgress,
			curveLimit: token.curveLimit,
			waifuBonded: token.reserveAmount,
			raisedToken: "BNB",
			twitterHandle: token.socials?.twitter
				? token.socials.twitter.split("/").pop()?.replace("@", "")
				: undefined,
			pancakeSwapUrl: token.pool
				? `https://pancakeswap.finance/swap?outputCurrency=${token.contractAddress}`
				: undefined,
			fourMemeUrl: `https://four.meme/token/${token.contractAddress}`,
		};
		return shaped;
	} catch (e) {
		console.error("fallback token fetch failed", e);
		return null;
	}
}

async function fetchTrades(address: string): Promise<AgentTrade[]> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}/trades`, {
			next: { revalidate: 10 },
		});
		if (res.ok) {
			const data = await res.json();
			return Array.isArray(data) ? data : (data.docs ?? data.trades ?? []);
		}
	} catch (e) {
		console.error("trades fetch failed", e);
	}

	// fallback: legacy trades endpoint
	try {
		const res = await fetch(`${API_BASE}/tokens/trades`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chain: "bsc",
				chainId: 56,
				contractAddress: address,
				limit: 20,
			}),
			next: { revalidate: 10 },
		});
		if (!res.ok) return [];
		const data = await res.json();
		const docs = Array.isArray(data) ? data : (data.docs ?? []);
		return docs.slice(0, 20).map((t: Record<string, unknown>) => ({
			txId: String(t.txId ?? ""),
			type: (t.type === "sell" ? "sell" : "buy") as "buy" | "sell",
			address: String(t.address ?? ""),
			amount: String(t.toAmount ?? t.fromAmount ?? ""),
			timestamp: typeof t.timestamp === "number" ? t.timestamp : Date.now(),
		}));
	} catch (e) {
		console.error("fallback trades fetch failed", e);
		return [];
	}
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ address: string }>;
}): Promise<Metadata> {
	const { address } = await params;
	const agent = await fetchAgent(address);
	if (!agent) return { title: "agent not found" };
	return {
		title: `${agent.name} / ${agent.ticker} — waifu.fun`,
		description: agent.description ?? `${agent.name} on waifu.fun`,
		openGraph: {
			title: `${agent.name} (${agent.ticker})`,
			description: agent.description ?? "",
		},
	};
}

export default async function AgentPage({
	params,
}: {
	params: Promise<{ address: string }>;
}) {
	const { address } = await params;

	const [agent, trades] = await Promise.all([
		fetchAgent(address),
		fetchTrades(address),
	]);

	if (!agent) {
		notFound();
	}

	return <AgentHome agent={agent} trades={trades} />;
}
