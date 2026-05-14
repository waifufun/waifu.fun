"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Address, isAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { ActivityFeed } from "@/components/launch-page/activity-feed";
import { DepositWidget } from "@/components/launch-page/deposit-widget";
import { LaunchFAQ } from "@/components/launch-page/launch-faq";
import { LaunchHero } from "@/components/launch-page/launch-hero";
import { LaunchTerms } from "@/components/launch-page/launch-terms";
import { RefundWidget } from "@/components/launch-page/refund-widget";
import { StateBanner } from "@/components/launch-page/state-banner";
import { TierInfoCard } from "@/components/launch-page/tier-info-card";
import { ErrorState } from "@/components/ui/error-state";
import { useLaunchMeta, useVaultSnapshot, useVaultUserPosition } from "@/hooks/use-launch-vault";
import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { deriveLaunchDisplayState, type LaunchDisplayState } from "@/lib/launch-vault/launch-display-state";
import { tierFromCapWei, tierFromString } from "@/lib/launch-vault/tiers";

type Props = {
	id: string;
};

export default function LaunchPageClient({ id }: Props) {
	const meta = useLaunchMeta(id);
	const queryClient = useQueryClient();

	const vaultAddress = useMemo<Address | undefined>(() => {
		const fromMeta = meta.data?.vaultAddress;
		if (typeof fromMeta === "string" && isAddress(fromMeta)) return fromMeta;
		// `id` itself is sometimes a vault address (the page accepts UUID *or*
		// vault contract address; backend should resolve UUIDs to vaults).
		if (id && isAddress(id)) return id as Address;
		return undefined;
	}, [meta.data?.vaultAddress, id]);

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
	const claimable = useClaimable(vaultAddress, displayState);

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["launch-meta", id] });
		void queryClient.invalidateQueries({ queryKey: ["launch-depositors", id] });
		void queryClient.invalidateQueries({ queryKey: ["vault-events-fallback", vaultAddress ?? null] });
		void snapshot.refetch();
	};

	if (!id || id === "_" || id === "placeholder") {
		return <NotFound id={id} reason="missing launch id" />;
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
		return <NotFound id={id} reason="launch not found" />;
	}

	const capWeiResolved = apiCapWei ?? capFromTier(tier.presaleCapBnb);

	return (
		<main
			className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 pb-32 md:pb-8"
			data-testid="launch-page"
		>
			<LaunchHero
				meta={meta.data ?? null}
				tier={tier}
				totalDeposited={totalDeposited}
				depositorCount={depositorCount}
				closeTimestamp={closeTimestamp}
				state={state}
				bonusPool={bonusPool}
			/>

			<StateBanner state={displayState} />

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
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
					<ActivityFeed launchId={id} vaultAddress={vaultAddress} />
				</div>
				<aside className="hidden lg:block">
					{displayState === "refunding" ? (
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
							onUserStateChanged={refresh}
						/>
					)}
				</aside>
			</div>

			{/* Mobile sticky widget. Renders below the lg breakpoint only. */}
			<div className="lg:hidden">
				{displayState === "refunding" ? (
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
						onUserStateChanged={refresh}
						sticky="bottom"
					/>
				)}
			</div>
		</main>
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

function useClaimable(vault: Address | undefined, displayState: LaunchDisplayState): bigint {
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
	return (r.data as bigint | undefined) ?? 0n;
}
