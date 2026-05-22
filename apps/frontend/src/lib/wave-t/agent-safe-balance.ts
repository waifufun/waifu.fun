/**
 * Server-side AgentSafe BNB balance fetch.
 *
 * The /agent/[address] page is an RSC, so we can't reach for `wagmi`
 * here (no React tree, no provider). Instead we hit a public BSC RPC
 * directly with `next: { revalidate: 30 }` so Next.js caches the
 * result across requests for the same agent.
 *
 * The wave-T Hero accepts a `treasuryValueOverride` prop; this module
 * produces that prop's payload for v3 launches that ship with an
 * AgentSafe (Gnosis Safe) address in the launch row.
 *
 * Honesty rules:
 *   - Returns null when no AgentSafe is configured (legacy launches).
 *   - Returns null on any RPC / price failure so the Hero falls back
 *     to the existing navUsd readout instead of silently zeroing out.
 *   - Source is hardcoded to "agentSafe" on success so the source
 *     pill on the Hero stays accurate.
 */

import { isAddress } from "viem";

const BSC_RPC = "https://bsc-mainnet.public.blastapi.io";
const COINGECKO_BNB = "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd";

export type AgentSafeBalance = {
	valueUsd: number;
	balanceBnb: number;
	bnbPriceUsd: number;
};

async function rpcBalanceBnb(address: string): Promise<number | null> {
	try {
		const res = await fetch(BSC_RPC, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "eth_getBalance",
				params: [address, "latest"],
				id: 1,
			}),
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const j = (await res.json()) as { result?: string };
		if (!j.result) return null;
		return Number.parseInt(j.result, 16) / 1e18;
	} catch {
		return null;
	}
}

async function bnbPriceUsd(): Promise<number | null> {
	try {
		const res = await fetch(COINGECKO_BNB, { next: { revalidate: 300 } });
		if (!res.ok) return null;
		const j = (await res.json()) as { binancecoin?: { usd?: number } };
		const usd = j.binancecoin?.usd;
		return typeof usd === "number" && usd > 0 ? usd : null;
	} catch {
		return null;
	}
}

/**
 * Fetch the AgentSafe's native BNB balance and convert it to USD.
 *
 * Returns null when the address is missing/invalid or when any of the
 * underlying calls fail. Callers should fall back to the existing
 * holdings.navUsd readout on null.
 */
export async function fetchAgentSafeBalance(agentSafe: string | null | undefined): Promise<AgentSafeBalance | null> {
	if (!agentSafe || !isAddress(agentSafe)) return null;
	const [bnb, price] = await Promise.all([rpcBalanceBnb(agentSafe), bnbPriceUsd()]);
	if (bnb == null || price == null) return null;
	return {
		balanceBnb: bnb,
		bnbPriceUsd: price,
		valueUsd: bnb * price,
	};
}
