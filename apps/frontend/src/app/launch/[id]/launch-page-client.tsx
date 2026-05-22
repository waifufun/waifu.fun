"use client";

import { useQueryClient } from "@tanstack/react-query";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { THEME_TOKENS } from "@/components/agent-home/wave-t/_primitives";
import { ActivityFeed } from "@/components/launch-page/activity-feed";
import { DepositWidget } from "@/components/launch-page/deposit-widget";
import { LaunchFAQ } from "@/components/launch-page/launch-faq";
import { LaunchHeroV2 } from "@/components/launch-page/launch-hero-v2";
import { LaunchTerms } from "@/components/launch-page/launch-terms";
import { RefundWidget } from "@/components/launch-page/refund-widget";
import { StateBanner } from "@/components/launch-page/state-banner";
import { TierInfoCard } from "@/components/launch-page/tier-info-card";
import { ClaimWidget } from "@/components/post-launch/claim-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useLaunchMeta, useVaultSnapshot, useVaultUserPosition } from "@/hooks/use-launch-vault";
import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { type LaunchDisplayState, deriveLaunchDisplayState } from "@/lib/launch-vault/launch-display-state";
import { tierFromCapWei, tierFromString } from "@/lib/launch-vault/tiers";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type Props = {
	id: string;
};

export default function LaunchPageClient({ id }: Props) {
	const [runtimeId] = useState(() => {
		if (id && id !== "_" && id !== "placeholder") return id;
		if (typeof window === "undefined") return id;
		return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(1) ?? "");
	});
	const meta = useLaunchMeta(runtimeId);
	const queryClient = useQueryClient();

	const vaultAddress = useMemo<Address | undefined>(() => {
		const fromMeta = meta.data?.vaultAddress;
		if (typeof fromMeta === "string" && isAddress(fromMeta)) return fromMeta;
		// `id` itself is sometimes a vault address (the page accepts UUID *or*
		// vault contract address; backend should resolve UUIDs to vaults).
		if (runtimeId && isAddress(runtimeId)) return runtimeId as Address;
		return undefined;
	}, [meta.data?.vaultAddress, runtimeId]);

	const snapshot = useVaultSnapshot(vaultAddress);
	const snap = snapshot.data;

	const apiCapWei = meta.data?.presaleCapWei ? safeBigInt(meta.data.presaleCapWei) : null;
	const tier = useMemo(() => {
		const fromMeta = tierFromString(meta.data?.tier ?? null);
		if (fromMeta) return fromMeta;
		return tierFromCapWei(apiCapWei);
	}, [meta.data?.tier, apiCapWei]);

	const closeTimestamp = snap?.closeTimestamp ?? closeFromMeta(meta.data?.closeAt);
	const totalDeposited = snap?.totalDeposited ?? 0n;
	const depositorCount = snap?.depositorCount ?? 0n;
	const bonusPool = snap?.bonusPool ?? null;
	const state = snap?.state ?? null;

	const displayState = useMemo(
		() =>
			deriveLaunchDisplayState({
				vaultState: state,
				backendStatus: meta.data?.status ?? null,
				closeTimestamp: closeTimestamp ?? null,
				tokenAddress: meta.data?.tokenAddress ?? null,
			}),
		[state, meta.data?.status, closeTimestamp, meta.data?.tokenAddress],
	);

	// User position is used by the vesting timeline post-launch.
	const userPosition = useVaultUserPosition(vaultAddress);
	const launchTimestamp = useLaunchTimestamp(vaultAddress, displayState);
	const claimableQuery = useClaimable(vaultAddress, displayState);
	const claimable = claimableQuery.value;
	const showClaimWidget = displayState === "launched" && claimable > 0n;
	const launchTimestampNumber = launchTimestamp ? Number(launchTimestamp) : null;

	const refresh = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: ["launch-meta", runtimeId] });
		void queryClient.invalidateQueries({ queryKey: ["launch-depositors", runtimeId] });
		void queryClient.invalidateQueries({ queryKey: ["vault-events-fallback", vaultAddress ?? null] });
		void snapshot.refetch();
	}, [queryClient, runtimeId, snapshot, vaultAddress]);

	const refreshAfterClaim = useCallback(() => {
		refresh();
		void userPosition.refetch();
		void claimableQuery.refetch();
	}, [claimableQuery, refresh, userPosition]);

	if (!runtimeId || runtimeId === "_" || runtimeId === "placeholder") {
		return <NotFound id={runtimeId} reason="missing launch id" />;
	}

	if (meta.isLoading && !meta.data) {
		return <LoadingState />;
	}

	if (meta.error) {
		return (
			<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-12">
				<ErrorState
					title="couldn't load this launch."
					message={meta.error instanceof Error ? meta.error.message : "unknown error."}
					onRetry={() => void meta.refetch()}
					homeHref="/launches"
				/>
			</main>
		);
	}

	if (!meta.data && !vaultAddress) {
		return <NotFound id={runtimeId} reason="launch not found" />;
	}

	const capWeiResolved = apiCapWei ?? capFromTier(tier.presaleCapBnb);

	return (
		<main
			aria-label="launch surface"
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			data-testid="launch-page"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
				<TopBar />

				<div className="mt-4">
					<LaunchHeroV2
						meta={meta.data ?? null}
						tier={tier}
						totalDeposited={totalDeposited}
						depositorCount={depositorCount}
						closeTimestamp={closeTimestamp}
						state={state}
						bonusPool={bonusPool}
					/>
				</div>

				<div className="mt-4">
					<StateBanner state={displayState} />
				</div>

				<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] pb-32 md:pb-8">
					<div className="flex flex-col gap-6">
						<TierInfoCard
							tier={tier}
							vestingEnabled={snap?.vestingEnabled ?? null}
							launchTimestamp={launchTimestamp}
							allocation={userPosition.allocation}
							claimed={userPosition.claimed}
							claimable={claimable}
						/>
						<LaunchFAQ tier={tier} />
						<LaunchTerms penaltyBps={snap?.penaltyBps ?? null} />
						<ActivityFeed launchId={runtimeId} vaultAddress={vaultAddress} />
					</div>
					<aside className="hidden lg:block">
						{showClaimWidget ? (
							<ClaimWidget
								vault={vaultAddress}
								ticker={meta.data?.tokenTicker ?? "tokens"}
								vestingEnabled={snap?.vestingEnabled ?? true}
								launchTimestamp={launchTimestampNumber}
								onClaimed={refreshAfterClaim}
							/>
						) : displayState === "refunding" ? (
							<RefundWidget
								vault={vaultAddress}
								totalDeposited={totalDeposited}
								bonusPool={bonusPool}
								onUserStateChanged={refresh}
							/>
						) : (
							<DepositWidget
								vault={vaultAddress}
								state={state}
								totalDeposited={totalDeposited}
								capWei={capWeiResolved}
								penaltyBps={snap?.penaltyBps ?? null}
								presaleTokens={snap?.presaleTokens ?? null}
								tokenSymbol={meta.data?.tokenTicker ?? null}
								tier={tier}
								closeTimestamp={closeTimestamp}
								onUserStateChanged={refresh}
							/>
						)}
					</aside>
				</div>

				{/* Mobile sticky widget. Renders below the lg breakpoint only. */}
				<div className="lg:hidden">
					{showClaimWidget ? (
						<ClaimWidget
							vault={vaultAddress}
							ticker={meta.data?.tokenTicker ?? "tokens"}
							vestingEnabled={snap?.vestingEnabled ?? true}
							launchTimestamp={launchTimestampNumber}
							onClaimed={refreshAfterClaim}
						/>
					) : displayState === "refunding" ? (
						<RefundWidget
							vault={vaultAddress}
							totalDeposited={totalDeposited}
							bonusPool={bonusPool}
							onUserStateChanged={refresh}
							sticky="bottom"
						/>
					) : (
						<DepositWidget
							vault={vaultAddress}
							state={state}
							totalDeposited={totalDeposited}
							capWei={capWeiResolved}
							penaltyBps={snap?.penaltyBps ?? null}
							presaleTokens={snap?.presaleTokens ?? null}
							tokenSymbol={meta.data?.tokenTicker ?? null}
							tier={tier}
							closeTimestamp={closeTimestamp}
							onUserStateChanged={refresh}
							sticky="bottom"
						/>
					)}
				</div>
			</div>
		</main>
	);
}

function TopBar() {
	return (
		<div className="flex items-center justify-between">
			<Link
				className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 transition-colors duration-200 hover:text-white/85"
				href="/launches"
			>
				<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
				all launches
			</Link>
		</div>
	);
}

function LoadingState() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
			<div className="relative h-32 border border-white/10 bg-[#08080a] overflow-hidden">
				<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
			</div>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
				<div className="flex flex-col gap-6">
					<div className="relative h-64 border border-white/10 bg-[#08080a] overflow-hidden">
						<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
					</div>
					<div className="relative h-48 border border-white/10 bg-[#08080a] overflow-hidden">
						<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
					</div>
				</div>
				<div className="relative h-72 border border-white/10 bg-[#08080a] overflow-hidden">
					<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
				</div>
			</div>
		</main>
	);
}

function NotFound({ id, reason }: { id: string; reason: string }) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-12">
			<ErrorState title="launch not found." message={`no round for ${id}. ${reason}`} homeHref="/launches" />
		</main>
	);
}

function safeBigInt(value: string): bigint | null {
	try {
		return BigInt(value);
	} catch {
		return null;
	}
}

function closeFromMeta(closeAt: string | null | undefined): bigint | null {
	if (!closeAt) return null;
	const t = Date.parse(closeAt);
	if (!Number.isFinite(t)) return null;
	return BigInt(Math.floor(t / 1000));
}

function capFromTier(bnb: number): bigint {
	return BigInt(Math.floor(bnb * 1e6)) * 10n ** 12n;
}

// Inline hook: launchTimestamp is only meaningful post-launch.
// We lean on the existing snapshot for everything else; this one extra read
// stays gated by display state so we don't burn rpc calls in `presale` mode.
function useLaunchTimestamp(vault: Address | undefined, displayState: LaunchDisplayState): bigint | null {
	const enabled = Boolean(vault) && displayState === "launched";
	const r = useReadContract({
		address: vault,
		abi: launchVaultAbi,
		functionName: "launchTimestamp",
		chainId: bsc.id,
		query: { enabled, staleTime: 60_000 },
	});
	const value = r.data as bigint | undefined;
	if (!value || value === 0n) return null;
	return value;
}

function useClaimable(vault: Address | undefined, displayState: LaunchDisplayState) {
	const { address } = useAccount();
	const enabled = Boolean(vault) && Boolean(address) && displayState === "launched";
	const r = useReadContract({
		address: vault,
		abi: launchVaultAbi,
		functionName: "claimableOf",
		args: address ? [address as Address] : undefined,
		chainId: bsc.id,
		query: { enabled, refetchInterval: 15_000 },
	});
	return {
		value: (r.data as bigint | undefined) ?? 0n,
		refetch: r.refetch,
	};
}
