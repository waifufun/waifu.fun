"use client";

import useAddress from "@/hooks/use-address";
import {
	type OwnerTokenRuntime,
	activateOwnerTokenRuntime,
	claimTokenOwnership,
	getAuthStatus,
	getOwnerTokenBilling,
	getOwnerTokenRuntime,
	resumeOwnerTokenRuntime,
	suspendOwnerTokenRuntime,
} from "@/lib/api";
import { cn, formatNumber, isSameWalletAddress, shortenAddress } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IToken } from "@waifufun/types";
import { AlertCircle, CheckCircle2, LoaderCircle, PauseCircle, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

type ClaimState = NonNullable<IToken["ownerClaimStatus"]> | "unclaimed";

const toneMap: Record<string, string> = {
	unclaimed: "border-white/8 bg-white/[0.02] text-[#a1a1aa]",
	claimed: "border-[#00ff87]/20 bg-[#00ff87]/[0.04] text-[#00ff87]",
	verified: "border-[#00ff87]/20 bg-[#00ff87]/[0.04] text-[#00ff87]",
	disputed: "border-amber-500/20 bg-amber-500/[0.04] text-amber-300",
	none: "border-white/8 bg-white/[0.02] text-[#a1a1aa]",
	provisioning: "border-sky-500/20 bg-sky-500/[0.04] text-sky-300",
	running: "border-[#00ff87]/20 bg-[#00ff87]/[0.04] text-[#00ff87]",
	suspended: "border-amber-500/20 bg-amber-500/[0.04] text-amber-300",
	failed: "border-red-500/20 bg-red-500/[0.04] text-red-300",
	deleted: "border-zinc-500/20 bg-zinc-500/[0.04] text-zinc-300",
};

function StatusPill({ label, tone }: { label: string; tone?: string | undefined }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em]",
				tone ?? toneMap.none,
			)}
		>
			{label}
		</span>
	);
}

function fmtErr(error?: Error) {
	const m = error?.message?.trim();
	if (!m) return "Owner control-plane unavailable.";
	if (/404|405|not found/i.test(m)) return "Owner routes not available on this backend branch.";
	return m;
}

function formatFundingSourceLabel(value?: string | null) {
	switch (value) {
		case "owner_credits":
			return "creator credits";
		case "waifu_treasury_subsidy":
			return "platform subsidy";
		case "hybrid":
			return "shared funding";
		default:
			return value ? value.replace(/_/g, " ") : null;
	}
}

function formatRunway(days: number) {
	if (!Number.isFinite(days) || days <= 0) return null;
	if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
	if (days < 14) return `${days.toFixed(1)}d`;
	if (days < 90) return `${Math.round(days)}d`;
	return `${(days / 30).toFixed(1)}mo`;
}

export default function OwnerRuntimePanel({ token }: { token: IToken }) {
	const queryClient = useQueryClient();
	const connectedWallet = useAddress();
	const [billingMode] = useState<NonNullable<OwnerTokenRuntime["billingMode"]>>(token.billingMode ?? "owner_credits");

	const authQK = ["auth-status"] as const;
	const tokenQK = ["token", token.chain, token.chainId, token.contractAddress] as const;
	const rtQK = ["owner-runtime", token.chain, token.chainId, token.contractAddress] as const;
	const billingQK = ["owner-billing", token.chain, token.chainId, token.contractAddress] as const;

	const creatorAddress = token.creator;
	const claimState: ClaimState = token.ownerClaimStatus ?? "unclaimed";
	const isClaimed = claimState === "claimed" || claimState === "verified";
	const isConnectedCreator = isSameWalletAddress(connectedWallet, creatorAddress ?? null);

	const authQuery = useQuery({ queryKey: authQK, queryFn: getAuthStatus, staleTime: 60_000, retry: false });

	const authCreatorWallet = useMemo(() => {
		const evm = authQuery.data?.wallets?.evm?.address;
		return evm && isSameWalletAddress(String(evm), creatorAddress ?? null) ? String(evm) : null;
	}, [authQuery.data, creatorAddress]);

	const canClaim = Boolean(authCreatorWallet);
	const canManage = canClaim && isClaimed;

	useEffect(() => {
		if (!isConnectedCreator || canClaim) return;
		const t = window.setTimeout(() => {
			void authQuery.refetch();
		}, 1_500);
		return () => window.clearTimeout(t);
	}, [authQuery.refetch, canClaim, isConnectedCreator]);

	const rtQuery = useQuery({
		queryKey: rtQK,
		queryFn: () =>
			getOwnerTokenRuntime({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress }),
		enabled: canManage,
		retry: false,
	});

	const billingQuery = useQuery({
		queryKey: billingQK,
		queryFn: () =>
			getOwnerTokenBilling({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress }),
		enabled: canManage,
		retry: false,
	});

	const refreshAll = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: authQK }),
			queryClient.invalidateQueries({ queryKey: tokenQK }),
			queryClient.invalidateQueries({ queryKey: rtQK }),
			queryClient.invalidateQueries({ queryKey: billingQK }),
		]);
	};

	const claimMut = useMutation({
		mutationFn: () =>
			claimTokenOwnership({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress }),
		onSuccess: async () => {
			toast.success("Owner access claimed");
			await refreshAll();
		},
		onError: (e: Error) => toast.error(fmtErr(e)),
	});

	const activateMut = useMutation({
		mutationFn: () =>
			activateOwnerTokenRuntime({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				billingMode,
				character: {
					name: token.name,
					...(token.description ? { bio: token.description } : {}),
					...(token.image ? { avatar: token.image } : {}),
				},
			}),
		onSuccess: async () => {
			toast.success("Runtime activation requested");
			await refreshAll();
		},
		onError: (e: Error) => toast.error(fmtErr(e)),
	});

	const suspendMut = useMutation({
		mutationFn: () =>
			suspendOwnerTokenRuntime({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress }),
		onSuccess: async () => {
			toast.success("Runtime suspended");
			await refreshAll();
		},
		onError: (e: Error) => toast.error(fmtErr(e)),
	});

	const resumeMut = useMutation({
		mutationFn: () =>
			resumeOwnerTokenRuntime({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress }),
		onSuccess: async () => {
			toast.success("Runtime resumed");
			await refreshAll();
		},
		onError: (e: Error) => toast.error(fmtErr(e)),
	});

	const runtime = rtQuery.data?.runtime;
	const runtimeStatus = runtime?.agentStatus ?? "none";
	const anyPending = claimMut.isPending || activateMut.isPending || suspendMut.isPending || resumeMut.isPending;
	const reserveUsd = [runtime?.infraReserveUsd, billingQuery.data?.infraReserveUsd, token.infraReserveUsd].find(
		(value) => typeof value === "number" && Number.isFinite(value),
	);
	const estimatedDailyBurnUsd = billingQuery.data?.estimatedDailyBurnUsd;
	const currentPeriodCostUsd = billingQuery.data?.currentPeriodCostUsd;
	const fundingSourceLabel = formatFundingSourceLabel(
		billingQuery.data?.fundingSource ?? runtime?.billingMode ?? token.billingMode,
	);
	const shouldShowBurn =
		typeof estimatedDailyBurnUsd === "number" &&
		Number.isFinite(estimatedDailyBurnUsd) &&
		Boolean(
			runtime?.hasAgent ??
				runtime?.cloudAgentId ??
				(billingQuery.data?.fundingSource != null || currentPeriodCostUsd != null),
		);
	const runwayEstimate =
		typeof reserveUsd === "number" &&
		Number.isFinite(reserveUsd) &&
		typeof estimatedDailyBurnUsd === "number" &&
		Number.isFinite(estimatedDailyBurnUsd) &&
		estimatedDailyBurnUsd > 0
			? formatRunway(reserveUsd / estimatedDailyBurnUsd)
			: null;
	const economicsRows = [
		shouldShowBurn ? { key: "daily burn", value: formatNumber(estimatedDailyBurnUsd, true) } : null,
		typeof currentPeriodCostUsd === "number" && Number.isFinite(currentPeriodCostUsd)
			? { key: "current spend", value: formatNumber(currentPeriodCostUsd, true) }
			: null,
		fundingSourceLabel ? { key: "funding source", value: fundingSourceLabel } : null,
		runwayEstimate ? { key: "runway", value: runwayEstimate } : null,
	].filter((row): row is { key: string; value: string } => Boolean(row));

	return (
		<div className="rounded-sm border border-white/6 bg-[#111114]/60 p-4 transition-colors hover:border-white/8">
			<div className="flex flex-col gap-3">
				{/* Header */}
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<ShieldCheck className="size-3.5 text-[#00ff87]/70" />
						<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#52525b]">operator</span>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void refreshAll()}
						disabled={anyPending}
						className="h-6 px-1.5 text-[10px] font-mono text-[#52525b] hover:text-[#a1a1aa]"
					>
						<RefreshCw className="size-3" />
					</Button>
				</div>

				{/* Unclaimed state */}
				{!isClaimed && (
					<div className="flex items-center gap-2 flex-wrap">
						<StatusPill label={claimState} tone={toneMap[claimState]} />
						{creatorAddress && (
							<span className="text-[10px] font-mono text-[#3f3f46]">{shortenAddress(creatorAddress)}</span>
						)}
						{canClaim ? (
							<Button
								onClick={() => claimMut.mutate()}
								disabled={claimMut.isPending || !creatorAddress}
								className="ml-auto h-6 px-2 text-[10px] font-mono uppercase"
							>
								{claimMut.isPending ? (
									<LoaderCircle className="size-3 animate-spin" />
								) : (
									<CheckCircle2 className="size-3" />
								)}
								claim
							</Button>
						) : (
							<span className="ml-auto text-[10px] text-[#3f3f46] font-mono">
								{authQuery.isLoading
									? "checking..."
									: isConnectedCreator
										? "finish auth to claim"
										: "connect creator wallet"}
							</span>
						)}
					</div>
				)}

				{/* Claimed state */}
				{isClaimed && (
					<>
						<div className="flex items-center gap-2 flex-wrap">
							<StatusPill label={runtimeStatus.replace(/_/g, " ")} tone={toneMap[runtimeStatus]} />
							{typeof reserveUsd === "number" && !Number.isNaN(reserveUsd) && (
								<span className="text-[10px] font-mono text-[#52525b]">{formatNumber(reserveUsd, true)}</span>
							)}
						</div>

						{rtQuery.isLoading && (
							<div className="flex items-center gap-2 text-[10px] text-[#52525b]">
								<LoaderCircle className="size-3 animate-spin text-[#00ff87]/60" />
								<span className="font-mono uppercase">loading...</span>
							</div>
						)}

						{rtQuery.error && (
							<div className="flex items-center gap-2 text-[10px] text-red-300/80">
								<AlertCircle className="size-3" />
								<span>{fmtErr(rtQuery.error)}</span>
							</div>
						)}

						{!rtQuery.isLoading && !rtQuery.error && (
							<>
								<div className="flex items-center gap-1.5 flex-wrap">
									{(runtimeStatus === "none" || runtimeStatus === "failed" || runtimeStatus === "deleted") && (
										<Button
											onClick={() => activateMut.mutate()}
											disabled={activateMut.isPending}
											className="h-6 px-2 text-[10px] font-mono uppercase"
										>
											{activateMut.isPending ? (
												<LoaderCircle className="size-3 animate-spin" />
											) : (
												<PlayCircle className="size-3" />
											)}
											activate
										</Button>
									)}
									{runtimeStatus === "running" && (
										<Button
											variant="outline"
											onClick={() => suspendMut.mutate()}
											disabled={suspendMut.isPending}
											className="h-6 px-2 text-[10px] font-mono uppercase text-amber-300/80 hover:text-amber-200 border-amber-500/15"
										>
											{suspendMut.isPending ? (
												<LoaderCircle className="size-3 animate-spin" />
											) : (
												<PauseCircle className="size-3" />
											)}
											pause
										</Button>
									)}
									{runtimeStatus === "suspended" && (
										<Button
											onClick={() => resumeMut.mutate()}
											disabled={resumeMut.isPending}
											className="h-6 px-2 text-[10px] font-mono uppercase"
										>
											{resumeMut.isPending ? (
												<LoaderCircle className="size-3 animate-spin" />
											) : (
												<RefreshCw className="size-3" />
											)}
											resume
										</Button>
									)}
									{runtimeStatus === "provisioning" && (
										<span className="flex items-center gap-1 text-[10px] font-mono text-sky-300/80">
											<LoaderCircle className="size-3 animate-spin" />
											provisioning
										</span>
									)}
								</div>

								{economicsRows.length > 0 && (
									<div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 pt-1 border-t border-white/[0.03]">
										{economicsRows.map((row) => (
											<div key={row.key} className="flex items-baseline justify-between gap-2 py-1">
												<span className="text-[10px] font-mono uppercase tracking-wider text-[#3f3f46]">
													{row.key}
												</span>
												<span className="text-[11px] font-mono text-[#a1a1aa]">{row.value}</span>
											</div>
										))}
									</div>
								)}
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
}
