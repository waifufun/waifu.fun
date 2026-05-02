import AgentHome from "@/components/agent-home/agent-home";
import type { AgentData, AgentTrade } from "@/components/agent-home/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
	const { isStaticExport, fetchAgentAddressesForStaticExport } = await import("@/lib/static-export-paths");
	if (!isStaticExport()) return [];
	return fetchAgentAddressesForStaticExport();
}

/** Absolute base required for SSG fetches (`/api` is invalid in Node during `next build`). */
function serverAgentApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

const API_BASE = serverAgentApiBase();
const FOURMEME_BASE = "https://four.meme/token";

/**
 * Backend shape (AgentDetail) doesn't match AgentData; do the same kind of
 * mapping we do in agents-api.ts for list items, but with the extra fields
 * only the detail returns (system prompt, traits, curve).
 */
function mapAgentDetail(raw: unknown): AgentData | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const tokenAddress =
		typeof r.tokenAddress === "string" ? r.tokenAddress : typeof r.token_address === "string" ? r.token_address : "";
	if (!tokenAddress) return null;
	const name = typeof r.name === "string" ? r.name : "unknown";
	const ticker = typeof r.ticker === "string" ? r.ticker : typeof r.symbol === "string" ? r.symbol : "";
	const rawStatus = r.status;
	const status: AgentData["status"] =
		rawStatus === "graduated" ? "graduated" : rawStatus === "pending" || rawStatus === "failed" ? "pending" : "active";

	const shaped: AgentData = {
		tokenAddress,
		name,
		ticker,
		status,
		fourMemeUrl: `${FOURMEME_BASE}/${tokenAddress}`,
	};
	const image = typeof r.image === "string" ? r.image : typeof r.avatarUrl === "string" ? r.avatarUrl : undefined;
	if (image) shaped.image = image;
	if (typeof r.description === "string") shaped.description = r.description;
	if (typeof r.walletAddress === "string") shaped.walletAddress = r.walletAddress;
	if (typeof r.treasuryAddress === "string") shaped.treasuryAddress = r.treasuryAddress;
	if (typeof r.preset === "string") shaped.preset = r.preset;
	if (typeof r.systemPrompt === "string") shaped.systemPrompt = r.systemPrompt;
	if (typeof r.twitterHandle === "string") shaped.twitterHandle = r.twitterHandle;
	if (Array.isArray(r.traits)) shaped.traits = r.traits.filter((t): t is string => typeof t === "string");

	const curve = r.curve as Record<string, unknown> | null | undefined;
	if (curve) {
		const bonded = curve.waifuBonded;
		const limit = curve.curveLimit;
		if (typeof bonded === "string" || typeof bonded === "number") shaped.waifuBonded = Number(bonded);
		if (typeof limit === "string" || typeof limit === "number") shaped.curveLimit = Number(limit);
		if (shaped.waifuBonded !== undefined && shaped.curveLimit !== undefined && shaped.curveLimit > 0) {
			shaped.curveProgress = Math.min(100, (shaped.waifuBonded / shaped.curveLimit) * 100);
		}
		if (typeof curve.raisedToken === "string") shaped.raisedToken = curve.raisedToken;
		if (typeof curve.pancakeswapPair === "string") {
			shaped.pancakeSwapUrl = `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}&chain=bsc`;
		}
	}

	const identity = r.identity as Record<string, unknown> | null | undefined;
	if (identity) {
		const tid = identity.eip8004TokenId;
		if (typeof tid === "string" || typeof tid === "number") shaped.eip8004TokenId = tid;
	}

	if (typeof r.framework === "string") shaped.framework = r.framework;
	if (typeof r.model === "string") shaped.model = r.model;
	if (r.lastActionAt) {
		const t = typeof r.lastActionAt === "string" ? Date.parse(r.lastActionAt) : Number(r.lastActionAt);
		if (Number.isFinite(t)) shaped.lastActionAt = t;
	}
	if (typeof r.lastActionType === "string") shaped.lastActionType = r.lastActionType;

	return shaped;
}

async function fetchAgent(address: string): Promise<AgentData | null> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}`, {
			next: { revalidate: 30 },
		});
		if (res.ok) {
			const mapped = mapAgentDetail(await res.json());
			if (mapped) return mapped;
		}
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
			name: token.name,
			ticker: token.ticker,
			status: token.status === "migrated" || token.status === "locked" ? "graduated" : "active",
			raisedToken: "BNB",
			fourMemeUrl: `https://four.meme/token/${token.contractAddress}`,
		};
		if (token.creator) shaped.walletAddress = token.creator;
		if (token.bondingCurveAddress) shaped.treasuryAddress = token.bondingCurveAddress;
		if (token.image) shaped.image = token.image;
		if (token.description) shaped.description = token.description;
		if (token.curveProgress !== undefined) shaped.curveProgress = token.curveProgress;
		if (token.curveLimit !== undefined) shaped.curveLimit = token.curveLimit;
		if (token.reserveAmount !== undefined) shaped.waifuBonded = token.reserveAmount;
		if (token.socials?.twitter) {
			const handle = token.socials.twitter.split("/").pop()?.replace("@", "");
			if (handle) shaped.twitterHandle = handle;
		}
		if (token.pool) {
			shaped.pancakeSwapUrl = `https://pancakeswap.finance/swap?outputCurrency=${token.contractAddress}`;
		}
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

	const host = process.env.NEXT_PUBLIC_HOST || "https://waifu.fun";
	const title = `${agent.name} ($${agent.ticker}) · waifu.fun`;
	const description =
		agent.description ??
		"autonomous agent on waifu.fun. identity, brain, wallet, treasury. pair with BNB on four.meme.";
	// Per-agent OG image disabled — the nested /agent/[address]/opengraph-image
	// route inherits the wagmi/viem module graph from the app layout and 500s
	// with 'indexedDB is not defined'. Falls back to the root /opengraph-image
	// which works and still renders the brand card for shared agent pages.
	const ogUrl = `${host}/opengraph-image`;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: `${host}/agent/${agent.tokenAddress}`,
			images: [
				{
					url: ogUrl,
					width: 1200,
					height: 630,
					alt: `${agent.name} on waifu.fun`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogUrl],
		},
	};
}

export default async function AgentPage({
	params,
}: {
	params: Promise<{ address: string }>;
}) {
	const { address } = await params;

	const [agent, trades] = await Promise.all([fetchAgent(address), fetchTrades(address)]);

	if (!agent) {
		notFound();
	}

	return <AgentHome agent={agent} trades={trades} />;
}
