"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, isAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { bsc } from "wagmi/chains";

import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { type AgentLaunchByToken, fetchLaunchByToken } from "@/lib/post-launch/api";
import { treasuryLpAbi } from "@/lib/post-launch/treasury-lp-abi";

const POLL_MS = 15_000;
const BURN_POLL_MS = 10_000;

/**
 * Lookup a v3 launch by token address. Returns `null` (not undefined) when
 * the API responds with 404 - callers can branch on `data === null` to
 * decide whether to render the v3 surface.
 */
export function useLaunchByToken(tokenAddress: string | undefined) {
	return useQuery({
		queryKey: ["launch-by-token", tokenAddress?.toLowerCase() ?? null],
		enabled: Boolean(tokenAddress) && tokenAddress !== undefined && isAddress(tokenAddress),
		queryFn: async (): Promise<AgentLaunchByToken | null> => {
			if (!tokenAddress) return null;
			return fetchLaunchByToken(tokenAddress);
		},
		staleTime: 30_000,
	});
}

/**
 * Vault claim state for the connected user. Reads `claimableOf`, `vestedOf`,
 * `allocationOf`, plus the depositor tuple so the claim widget can render
 * "claimable now / vested / locked" without juggling multiple read hooks.
 */
export function useClaimState(vault: Address | undefined) {
	const { address } = useAccount();
	const enabled = Boolean(vault) && Boolean(address) && (vault ? isAddress(vault) : false);

	const result = useReadContracts({
		allowFailure: false,
		contracts:
			enabled && vault && address
				? [
						{
							address: vault,
							abi: launchVaultAbi,
							functionName: "claimableOf",
							args: [address],
							chainId: bsc.id,
						},
						{
							address: vault,
							abi: launchVaultAbi,
							functionName: "vestedOf",
							args: [address],
							chainId: bsc.id,
						},
						{
							address: vault,
							abi: launchVaultAbi,
							functionName: "allocationOf",
							args: [address],
							chainId: bsc.id,
						},
						{
							address: vault,
							abi: launchVaultAbi,
							functionName: "depositors",
							args: [address],
							chainId: bsc.id,
						},
					]
				: undefined,
		query: {
			enabled,
			refetchInterval: POLL_MS,
			select: (rows) => {
				const [claimable, vested, allocation, depositorTuple] = rows as [
					bigint,
					bigint,
					bigint,
					readonly [bigint, bigint, boolean],
				];
				return {
					claimable,
					vested,
					allocation,
					deposited: depositorTuple[0],
					claimed: depositorTuple[1],
				};
			},
		},
	});
	return result;
}

/**
 * Tier ladder state. The TreasuryLP contract owns 12 tiers but the page
 * surfaces the first four (T1\u2013T4) per spec; each row carries:
 *   - deployed: tier already pushed liquidity
 *   - targetMcUsd: market-cap threshold (in USD, 8-decimal scaled)
 *   - epochsAbove / minEpochs: how close we are to the next deploy
 * The hook also reads `currentMcUSD()` so the widget can render
 * "next: T3 at $1.5M MC ($X away)".
 */
export function useTreasuryLpTiers(treasuryLp: Address | undefined) {
	const enabled = Boolean(treasuryLp) && (treasuryLp ? isAddress(treasuryLp) : false);

	// Mixed-shape contracts (different `functionName` + `args` per row) trip
	// wagmi's homogeneous-tuple inference. Cast through `unknown` to a loose
	// array shape, the types are still validated at the call site, just not
	// across the union.
	type MixedContract = {
		address: Address;
		abi: typeof treasuryLpAbi;
		functionName: "currentMcUSD" | "nextTierIndex" | "tiers";
		args?: readonly [bigint];
		chainId: number;
	};

	const contracts: MixedContract[] | undefined =
		enabled && treasuryLp
			? [
					{ address: treasuryLp, abi: treasuryLpAbi, functionName: "currentMcUSD", chainId: bsc.id },
					{ address: treasuryLp, abi: treasuryLpAbi, functionName: "nextTierIndex", chainId: bsc.id },
					...Array.from(
						{ length: 4 },
						(_, idx): MixedContract => ({
							address: treasuryLp,
							abi: treasuryLpAbi,
							functionName: "tiers",
							args: [BigInt(idx)] as const,
							chainId: bsc.id,
						}),
					),
				]
			: undefined;

	const meta = useReadContracts({
		allowFailure: true,
		// Wagmi's `contracts` prop wants a tuple of identical shapes; our list
		// is intentionally heterogenous (different functionName per slot). The
		// runtime contract is fine, we cast to bypass the tuple inference.
		contracts: contracts as unknown as readonly never[],
		query: {
			enabled,
			refetchInterval: POLL_MS,
		},
	});

	return meta;
}

/**
 * Token totalSupply + dead address balance for the burn counter.
 *
 * BSC uses `0x000000000000000000000000000000000000dEaD` as the canonical
 * burn address; we also include the zero address so anything sent there
 * shows up. Numbers are returned as bigints so the widget can format with
 * its own decimal handling.
 */
export function useBurnStats(tokenAddress: Address | undefined) {
	const enabled = Boolean(tokenAddress) && (tokenAddress ? isAddress(tokenAddress) : false);

	const erc20Abi = [
		{
			type: "function",
			stateMutability: "view",
			name: "totalSupply",
			inputs: [],
			outputs: [{ name: "", type: "uint256" }],
		},
		{
			type: "function",
			stateMutability: "view",
			name: "balanceOf",
			inputs: [{ name: "", type: "address" }],
			outputs: [{ name: "", type: "uint256" }],
		},
	] as const;

	const dead = "0x000000000000000000000000000000000000dEaD" as Address;
	const zero = "0x0000000000000000000000000000000000000000" as Address;

	return useReadContracts({
		allowFailure: false,
		contracts:
			enabled && tokenAddress
				? [
						{ address: tokenAddress, abi: erc20Abi, functionName: "totalSupply", chainId: bsc.id },
						{ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [dead], chainId: bsc.id },
						{ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [zero], chainId: bsc.id },
					]
				: undefined,
		query: {
			enabled,
			refetchInterval: BURN_POLL_MS,
			select: (rows) => {
				const [totalSupply, deadBal, zeroBal] = rows as [bigint, bigint, bigint];
				return {
					totalSupply,
					burned: deadBal + zeroBal,
				};
			},
		},
	});
}
