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

/* ── helpers ── */
type ClaimState = NonNullable<IToken["ownerClaimStatus"]> | "unclaimed";

const TONE: Record<string, string> = {
	unclaimed: "border-white/10 bg-white/5 text-[#e4e4e7]",
	claimed: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	verified: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	disputed: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	none: "border-white/10 bg-white/5 text-[#e4e4e7]",
	provisioning: "border-sky-500/30 bg-sky-500/10 text-sky-300",
	running: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	suspended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	failed: "border-red-500/30 bg-red-500/10 text-red-300",
	deleted: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

function StatusPill({ label, tone }: { label: string; tone?: string | undefined }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]",
				tone ?? TONE.none,
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

	/* ── auth ── */
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

	/* ── runtime ── */
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

	/* ── mutations ── */
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

	/* ── render ── */
	return (
		<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3 sm:p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]">
			<div className="flex flex-col gap-3">
				{/* header */}
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-[#00ff87]" />
						<span className="text-[10px] font-mono uppercase tracking-wider text-[#71717a]">owner console</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							void refreshAll();
						}}
						disabled={anyPending}
						className="h-7 px-2 text-[10px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
					>
						<RefreshCw className="size-3" />
						refresh
					</Button>
				</div>

				{/* claim section — single button if unclaimed */}
				{!isClaimed && (
					<div className="flex items-center gap-2 flex-wrap rounded-sm border border-white/6 bg-[#0a0a0d] p-2.5">
						<StatusPill label={claimState} tone={TONE[claimState]} />
						{creatorAddress && (
							<span className="text-[10px] font-mono text-[#52525b]">{shortenAddress(creatorAddress)}</span>
						)}
						{canClaim ? (
							<Button
								onClick={() => claimMut.mutate()}
								disabled={claimMut.isPending || !creatorAddress}
								className="ml-auto h-7 px-3 text-[10px] font-mono uppercase"
							>
								{claimMut.isPending ? (
									<LoaderCircle className="size-3 animate-spin" />
								) : (
									<CheckCircle2 className="size-3" />
								)}
								claim owner access
							</Button>
						) : (
							<span className="ml-auto text-[10px] text-[#52525b] font-mono">
								{authQuery.isLoading
									? "checking auth…"
									: isConnectedCreator
										? "finish wallet auth to claim"
										: "connect creator wallet"}
							</span>
						)}
					</div>
				)}

				{/* runtime — only after claimed */}
				{isClaimed && (
					<>
						{/* status + reserve row */}
						<div className="flex items-center gap-2 flex-wrap">
							<StatusPill label={runtimeStatus.replace(/_/g, " ")} tone={TONE[runtimeStatus]} />
							{typeof reserveUsd === "number" && !Number.isNaN(reserveUsd) && (
								<span className="text-[10px] font-mono text-[#52525b]">reserve: {formatNumber(reserveUsd, true)}</span>
							)}
						</div>

						{/* loading/error */}
						{rtQuery.isLoading && (
							<div className="flex items-center gap-2 text-xs text-[#71717a]">
								<LoaderCircle className="size-3.5 animate-spin text-[#00ff87]" />
								<span className="font-mono text-[10px] uppercase">loading runtime…</span>
							</div>
						)}
						{rtQuery.error && (
							<div className="flex items-center gap-2 text-xs text-red-300">
								<AlertCircle className="size-3.5" />
								<span>{fmtErr(rtQuery.error)}</span>
							</div>
						)}

						{/* action row */}
						{!rtQuery.isLoading && !rtQuery.error && (
							<>
								<div className="flex items-center gap-2 flex-wrap">
									{(runtimeStatus === "none" || runtimeStatus === "failed" || runtimeStatus === "deleted") && (
										<Button
											onClick={() => activateMut.mutate()}
											disabled={activateMut.isPending}
											className="h-7 px-3 text-[10px] font-mono uppercase"
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
											className="h-7 px-3 text-[10px] font-mono uppercase text-amber-300 hover:text-amber-200"
										>
											{suspendMut.isPending ? (
												<LoaderCircle className="size-3 animate-spin" />
											) : (
												<PauseCircle className="size-3" />
											)}
											suspend
										</Button>
									)}
									{runtimeStatus === "suspended" && (
										<Button
											onClick={() => resumeMut.mutate()}
											disabled={resumeMut.isPending}
											className="h-7 px-3 text-[10px] font-mono uppercase"
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
										<span className="flex items-center gap-1.5 text-[10px] font-mono text-sky-300">
											<LoaderCircle className="size-3 animate-spin" />
											provisioning…
										</span>
									)}

									<span className="ml-auto text-[10px] font-mono text-[#3f3f46]">
										billing: {(runtime?.billingMode ?? token.billingMode ?? "not configured").replace(/_/g, " ")}
									</span>
								</div>

								{economicsRows.length > 0 && (
									<div className="grid gap-2 sm:grid-cols-2">
										{economicsRows.map((row) => (
											<div key={row.key} className="rounded-sm border border-white/6 bg-[#0a0a0d] px-3 py-2.5">
												<div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#52525b]">
													{row.key}
												</div>
												<div className="mt-1 text-sm font-mono text-[#f4f4f5]">{row.value}</div>
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
