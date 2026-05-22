"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, isAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { bsc } from "wagmi/chains";

import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { fetchDepositors, fetchPublicLaunch } from "@/lib/launch-vault/api";

const VAULT_REFRESH_MS = 12_000;

/**
 * Loads the off-chain launch metadata. `id` may be a UUID, a token address,
 * or a vault address; the backend resolves the lookup. Returns `null` when
 * the launch is not found.
 */
export function useLaunchMeta(id: string | undefined) {
	return useQuery({
		queryKey: ["launch-meta", id ?? null],
		enabled: Boolean(id) && id !== "_",
		queryFn: async () => {
			if (!id) return null;
			return fetchPublicLaunch(id);
		},
		staleTime: 30_000,
	});
}

/**
 * Bulk vault read: snapshot of all immutable + mutable views the page renders.
 * Keys off the vault address only so the cache reuses across all panels.
 */
export function useVaultSnapshot(vault: Address | undefined) {
	const enabled = Boolean(vault) && (vault ? isAddress(vault) : false);
	// `allowFailure: true` is critical: an individual reverting view (e.g. an
	// ABI/contract drift like the historical `presaleTokens` vs
	// `presalerTokenBalance` mismatch) must NOT take down the whole snapshot.
	// On a launched vault, killing the snapshot causes `state` to fall back to
	// `null` and the display-state machine returns `"created"`, which hides
	// the claim widget for all depositors. Per-row tolerance keeps the page
	// rendering with whatever the chain returned.
	const result = useReadContracts({
		allowFailure: true,
		contracts: enabled
			? [
					{ address: vault as Address, abi: launchVaultAbi, functionName: "state", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "totalDeposited", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "bonusPool", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "depositorCount", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "closeTimestamp", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "penaltyBps", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "vestingEnabled", chainId: bsc.id },
					{ address: vault as Address, abi: launchVaultAbi, functionName: "presalerTokenBalance", chainId: bsc.id },
				]
			: undefined,
		query: {
			enabled,
			refetchInterval: VAULT_REFRESH_MS,
			select: (rows) => {
				const [
					stateRow,
					totalDepositedRow,
					bonusPoolRow,
					depositorCountRow,
					closeTimestampRow,
					penaltyBpsRow,
					vestingEnabledRow,
					presaleTokensRow,
				] = rows as ReadonlyArray<{ status: "success"; result: unknown } | { status: "failure"; error: Error }>;

				const pick = <T,>(row: typeof stateRow, fallback: T | null = null): T | null => {
					if (row && row.status === "success") return row.result as T;
					return fallback;
				};

				return {
					state: pick<number>(stateRow),
					totalDeposited: pick<bigint>(totalDepositedRow, 0n) ?? 0n,
					bonusPool: pick<bigint>(bonusPoolRow, 0n) ?? 0n,
					depositorCount: pick<bigint>(depositorCountRow, 0n) ?? 0n,
					closeTimestamp: pick<bigint>(closeTimestampRow),
					penaltyBps: pick<bigint>(penaltyBpsRow),
					vestingEnabled: pick<boolean>(vestingEnabledRow),
					presaleTokens: pick<bigint>(presaleTokensRow),
				};
			},
		},
	});
	return result;
}

/**
 * User-specific vault state: their deposit and projected token allocation.
 * Returns zeros (not undefined) when the user is not connected so the
 * deposit widget can short-circuit cleanly.
 */
export function useVaultUserPosition(vault: Address | undefined) {
	const { address } = useAccount();
	const enabled = Boolean(vault) && Boolean(address) && (vault ? isAddress(vault) : false);
	const userPosition = useReadContract({
		address: vault as Address | undefined,
		abi: launchVaultAbi,
		functionName: "depositors",
		args: address ? [address as Address] : undefined,
		chainId: bsc.id,
		query: {
			enabled,
			refetchInterval: VAULT_REFRESH_MS,
		},
	});
	const allocation = useReadContract({
		address: vault as Address | undefined,
		abi: launchVaultAbi,
		functionName: "allocationOf",
		args: address ? [address as Address] : undefined,
		chainId: bsc.id,
		query: {
			enabled,
			refetchInterval: VAULT_REFRESH_MS,
		},
	});

	const tuple = userPosition.data as readonly [bigint, bigint, boolean] | undefined;
	const deposited = tuple?.[0] ?? 0n;
	const claimed = tuple?.[1] ?? 0n;
	const seen = tuple?.[2] ?? false;

	return {
		address,
		deposited,
		claimed,
		seen,
		allocation: (allocation.data as bigint | undefined) ?? 0n,
		isLoading: userPosition.isLoading || allocation.isLoading,
		refetch: async () => {
			await Promise.all([userPosition.refetch(), allocation.refetch()]);
		},
	};
}

export function useDepositorsFeed(launchId: string | undefined) {
	return useQuery({
		queryKey: ["launch-depositors", launchId ?? null],
		enabled: Boolean(launchId) && launchId !== "_",
		queryFn: async () => {
			if (!launchId) return [];
			return fetchDepositors(launchId);
		},
		refetchInterval: 15_000,
		staleTime: 5_000,
	});
}
