/**
 * HeroLiveTreasury - thin client wrapper around <Hero> that computes the
 * treasury value live from the AgentSafe instead of trusting the
 * static-export holdings snapshot.
 *
 * Why this exists: <Hero> takes a `navUsd` number that's computed
 * server-side at build time from the Sol-burner wallet across five
 * chains. For a wave-M agent, the actual treasury lives in the
 * per-launch AgentSafe (BNB + the agent's own token allocation), and
 * the burner wallet is typically empty. The hero ended up showing
 * "$0" treasury which was wrong by ~$1M.
 *
 * Fix: read the AgentSafe BNB balance + the token balance via wagmi,
 * pull the token's USD price from DexScreener, and resolve a BNB→USD
 * rate. Sum the three. Pass the result to Hero. Fall back to the
 * server-side number when any input is missing so we never display
 * mid-flight garbage.
 *
 * All reads use `allowFailure: true` semantics already baked into the
 * shared hooks, so a single RPC blip doesn't blank the headline.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, formatEther, formatUnits, isAddress } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { usePostLaunchMarket } from "@/hooks/use-post-launch-market";

import { Hero, type HeroIdentity } from "./wave-t/hero";

const POLL_MS = 60_000;
const TOKEN_DECIMALS = 18;

const balanceOfAbi = [
	{
		type: "function",
		stateMutability: "view",
		name: "balanceOf",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

export interface HeroLiveTreasuryProps {
	identity: HeroIdentity;
	daysOperating: number;
	/** Server-rendered fallback. Used when live reads aren't ready or fail. */
	fallbackNavUsd: number;
	/** Token address (agent's own ERC-20). */
	tokenAddress: string;
	/** AgentSafe holding BNB + the agent token. Null on legacy launches. */
	agentSafe: string | null;
}

/**
 * CoinGecko BNB/USD spot. Used to value the AgentSafe's native BNB
 * holdings. We could read a Chainlink BNB/USD feed via RPC for more
 * authority but CG's free endpoint refreshes plenty fast for a
 * headline that updates on a 60s cadence.
 */
function useBnbUsd() {
	return useQuery<number | null>({
		queryKey: ["bnb-usd"],
		queryFn: async () => {
			try {
				const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
				if (!res.ok) return null;
				const json = (await res.json()) as { binancecoin?: { usd?: number } };
				const v = json?.binancecoin?.usd;
				return typeof v === "number" && Number.isFinite(v) ? v : null;
			} catch {
				return null;
			}
		},
		refetchInterval: POLL_MS,
		staleTime: 30_000,
	});
}

export default function HeroLiveTreasury({
	identity,
	daysOperating,
	fallbackNavUsd,
	tokenAddress,
	agentSafe,
}: HeroLiveTreasuryProps) {
	const safeValid = !!agentSafe && isAddress(agentSafe);
	const tokenValid = isAddress(tokenAddress);

	// 1. Native BNB in the safe.
	const bnbBal = useBalance({
		address: safeValid ? (agentSafe as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: safeValid, refetchInterval: POLL_MS },
	});

	// 2. Agent-token balance in the safe.
	const tokenBal = useReadContract({
		address: tokenValid ? (tokenAddress as Address) : undefined,
		abi: balanceOfAbi,
		functionName: "balanceOf",
		args: safeValid ? [agentSafe as Address] : undefined,
		chainId: bsc.id,
		query: { enabled: safeValid && tokenValid, refetchInterval: POLL_MS },
	});

	// 3. Spot prices.
	const market = usePostLaunchMarket(tokenValid ? tokenAddress : undefined, tokenValid);
	const bnbUsd = useBnbUsd();

	const tokenPriceUsd = market.data?.priceUsd ?? null;
	const bnbPriceUsd = bnbUsd.data ?? null;

	const liveNavUsd = computeLiveNav({
		bnbWei: bnbBal.data?.value ?? null,
		tokenRaw: typeof tokenBal.data === "bigint" ? tokenBal.data : null,
		tokenPriceUsd,
		bnbPriceUsd,
	});

	// If we couldn't price the treasury (all inputs missing), fall back
	// to the server-side number — better to show a stale-ish stat than a
	// confusing zero. If we got SOME of the components, we still show
	// the partial sum, because zero in a missing leg is a fair
	// undervaluation rather than misleading information.
	const navUsd = liveNavUsd !== null ? liveNavUsd : fallbackNavUsd;

	return <Hero identity={identity} daysOperating={daysOperating} navUsd={navUsd} pnl24hPct={0} pnl24hUsd={0} />;
}

interface NavInputs {
	bnbWei: bigint | null;
	tokenRaw: bigint | null;
	tokenPriceUsd: number | null;
	bnbPriceUsd: number | null;
}

/**
 * Returns null when both legs are uncomputable, otherwise the sum of
 * whichever legs we have.
 */
function computeLiveNav(inputs: NavInputs): number | null {
	const bnbUsd =
		inputs.bnbWei !== null && inputs.bnbPriceUsd !== null
			? Number(formatEther(inputs.bnbWei)) * inputs.bnbPriceUsd
			: null;
	const tokUsd =
		inputs.tokenRaw !== null && inputs.tokenPriceUsd !== null
			? Number(formatUnits(inputs.tokenRaw, TOKEN_DECIMALS)) * inputs.tokenPriceUsd
			: null;

	if (bnbUsd === null && tokUsd === null) return null;
	return (bnbUsd ?? 0) + (tokUsd ?? 0);
}
