"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Address, isAddress } from "viem";

import { ActivityFeed } from "@/components/launch-page/activity-feed";
import { DepositWidget } from "@/components/launch-page/deposit-widget";
import { LaunchHero } from "@/components/launch-page/launch-hero";
import { LaunchTerms } from "@/components/launch-page/launch-terms";
import { TierInfoCard } from "@/components/launch-page/tier-info-card";
import { useLaunchMeta, useVaultSnapshot } from "@/hooks/use-launch-vault";
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
	const state = snap?.state ?? null;

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["launch-meta", id] });
		void queryClient.invalidateQueries({ queryKey: ["launch-depositors", id] });
		void queryClient.invalidateQueries({ queryKey: ["vault-events-fallback", vaultAddress ?? null] });
		void snapshot.refetch();
	};

	if (!id || id === "_") {
		return <NotFound id={id} reason="missing launch id" />;
	}

	if (meta.isLoading && !meta.data) {
		return <LoadingState />;
	}

	if (meta.error) {
		return <NotFound id={id} reason={meta.error instanceof Error ? meta.error.message : "failed to load launch"} />;
	}

	if (!meta.data && !vaultAddress) {
		return <NotFound id={id} reason="launch not found" />;
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
			<LaunchHero
				meta={meta.data ?? null}
				tier={tier}
				totalDeposited={totalDeposited}
				depositorCount={depositorCount}
				closeTimestamp={closeTimestamp}
				state={state}
			/>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
				<div className="flex flex-col gap-6">
					<TierInfoCard tier={tier} vestingEnabled={snap?.vestingEnabled ?? null} />
					<LaunchTerms penaltyBps={snap?.penaltyBps ?? null} />
					<ActivityFeed launchId={id} vaultAddress={vaultAddress} />
				</div>
				<aside>
					<DepositWidget
						vault={vaultAddress}
						state={state}
						totalDeposited={totalDeposited}
						capWei={apiCapWei ?? (snap?.totalDeposited !== undefined ? capFromTier(tier.presaleCapBnb) : 0n)}
						penaltyBps={snap?.penaltyBps ?? null}
						presaleTokens={snap?.presaleTokens ?? null}
						tokenSymbol={meta.data?.tokenTicker ?? null}
						onUserStateChanged={refresh}
					/>
				</aside>
			</div>
		</main>
	);
}

function LoadingState() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
			<div className="h-32 border border-white/10 bg-[#08080a]" />
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
				<div className="flex flex-col gap-6">
					<div className="h-64 border border-white/10 bg-[#08080a]" />
					<div className="h-48 border border-white/10 bg-[#08080a]" />
				</div>
				<div className="h-72 border border-white/10 bg-[#08080a]" />
			</div>
		</main>
	);
}

function NotFound({ id, reason }: { id: string; reason: string }) {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
			<h1 className="text-2xl font-semibold text-zinc-100">launch not found</h1>
			<p className="text-sm text-zinc-400">
				we couldn't find a round for <span className="font-mono">{id}</span>.
			</p>
			<p className="text-xs text-zinc-500">{reason}</p>
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
