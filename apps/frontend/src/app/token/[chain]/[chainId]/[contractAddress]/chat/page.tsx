import ScrollToTop from "@/components/scroll-to-top";
import { getToken } from "@/lib/api";
import {
	fetchAgentTokenRouteParamsForStaticExport,
	fetchTokenRouteParamsForStaticExport,
} from "@/lib/static-export-paths";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import ChatFrame from "./chat-frame";

export async function generateStaticParams() {
	const [tokens, agents] = await Promise.all([
		fetchTokenRouteParamsForStaticExport(),
		fetchAgentTokenRouteParamsForStaticExport(),
	]);
	const seen = new Set<string>();
	return [...tokens, ...agents].filter((params) => {
		const key = `${params.chain}:${params.chainId}:${params.contractAddress.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: ChatToken | null = null;

	if (isBscAgentToken(tokenParams)) {
		token = await fetchAgentTokenFallback(tokenParams);
	} else {
		try {
			token = (await getToken(tokenParams)) as ChatToken;
		} catch (err) {
			console.error("API fetch failed:", err);
			token = await fetchAgentTokenFallback(tokenParams);
		}
	}

	if (!token) notFound();

	const runtime = token as IToken & { cloudAgentId?: string; webUiUrl?: string; agentStatus?: string };
	const status = runtime.agentStatus ?? "none";

	return (
		<>
			<ScrollToTop />
			<main className="min-h-[100dvh] bg-[#08080a] text-white">
				<div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
					<header className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
						<div>
							<Link
								href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
								className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-white"
							>
								back to token
							</Link>
							<h1 className="mt-2 text-lg font-mono text-white">{token.name} chat</h1>
							<p className="text-xs font-mono text-neutral-500">
								guest: &gt;1,000 tokens · user: &gt;100,000 tokens · creator: admin
							</p>
						</div>
						<span className="rounded-sm border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-300">
							{status}
						</span>
					</header>

					<ChatFrame params={tokenParams} tokenName={token.name} status={status} cloudAgentId={runtime.cloudAgentId} />
				</div>
			</main>
		</>
	);
}

type ChatToken = IToken & {
	cloudAgentId?: string | null;
	webUiUrl?: string | null;
	agentStatus?: string | null;
};

function isBscAgentToken(params: { chain?: string | null; chainId?: string | number | null }): boolean {
	return String(params.chain).toLowerCase() === "bsc" && String(params.chainId) === "56";
}

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim() ?? process.env.API_ORIGIN?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	return "https://api.waifu.fun";
}

function unwrapApiData(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && "data" in value) {
		const data = (value as { data?: unknown }).data;
		return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
	}
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(value: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const raw = value[key];
		if (typeof raw === "string" && raw.trim().length > 0) return raw;
	}
	return null;
}

function numberField(value: Record<string, unknown>, key: string, fallback: number): number {
	const raw = value[key];
	const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchAgentTokenFallback(params: ITokenLookUp): Promise<ChatToken | null> {
	try {
		const response = await fetch(`${serverApiBase()}/v2/agents/${params.contractAddress}`, {
			next: { revalidate: 30 },
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok) return null;
		const agent = unwrapApiData(await response.json());
		const contractAddress = stringField(agent, "tokenAddress", "token_address", "contractAddress", "address");
		if (!contractAddress) return null;
		const ticker = stringField(agent, "ticker", "symbol") ?? "";
		return {
			contractAddress,
			chain: params.chain ?? "bsc",
			chainId: Number(params.chainId ?? 56),
			name: stringField(agent, "name") ?? ticker ?? contractAddress,
			ticker,
			image: stringField(agent, "image", "avatarUrl", "avatar") ?? "/waifus/default.png",
			description: stringField(agent, "description", "bio") ?? "",
			price: numberField(agent, "price", 0),
			totalSupply: numberField(agent, "totalSupply", 0),
			marketcap: numberField(agent, "marketCap", 0),
			volume24h: numberField(agent, "volume24h", 0),
			decimals: numberField(agent, "decimals", 18),
			holders: numberField(agent, "holders", 0),
			status: stringField(agent, "status") ?? "active",
			curveProgress: numberField(agent, "curveProgress", 0),
			featured: Boolean(agent.featured),
			imported: Boolean(agent.imported),
			socials: {},
			version: 1,
			creator: stringField(agent, "creatorAddress", "creator", "walletAddress") ?? undefined,
			createdAt: stringField(agent, "createdAt", "launchDate", "launchedAt") ?? undefined,
			hidden: Boolean(agent.hidden),
			verified: Boolean(agent.verified),
			pool: stringField(agent, "poolAddress", "pool") ?? undefined,
			metadataUrl: stringField(agent, "metadataUrl") ?? undefined,
			curveCompleted: Boolean(agent.curveCompleted),
			agentStatus: stringField(agent, "agentStatus", "runtimeStatus", "status"),
			cloudAgentId: stringField(agent, "cloudAgentId", "elizaCloudAgentId"),
			webUiUrl: stringField(agent, "webUiUrl", "chatUrl"),
			billingMode: stringField(agent, "billingMode") ?? undefined,
			infraReserveUsd: numberField(agent, "infraReserveUsd", 0),
			hasAgent: Boolean(agent.cloudAgentId || agent.elizaCloudAgentId || agent.webUiUrl),
			launchPlatform: stringField(agent, "launchPlatform") ?? undefined,
		} as ChatToken;
	} catch (err) {
		console.error("Agent fallback fetch failed:", err);
		return null;
	}
}
