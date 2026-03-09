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
import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	LoaderCircle,
	PauseCircle,
	PlayCircle,
	RefreshCw,
	ShieldCheck,
	Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { useTranslation } from "@/contexts/locale-context";

type ClaimState = NonNullable<IToken["ownerClaimStatus"]> | "unclaimed";
type BillingMode = NonNullable<OwnerTokenRuntime["billingMode"]>;

function getBillingModeOptions(t: (key: string) => string): Array<{ value: BillingMode; label: string; description: string }> {
	return [
		{ value: "owner_credits", label: t("owner.billingOwnerCredits"), description: t("owner.billingOwnerCreditsDesc") },
		{ value: "hybrid", label: t("owner.billingHybrid"), description: t("owner.billingHybridDesc") },
		{ value: "waifu_treasury_subsidy", label: t("owner.billingTreasury"), description: t("owner.billingTreasuryDesc") },
	];
}

const claimToneMap: Record<ClaimState, string> = {
	unclaimed: "border-white/10 bg-white/5 text-[#e4e4e7]",
	claimed: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	verified: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	disputed: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

const runtimeToneMap: Record<string, string> = {
	none: "border-white/10 bg-white/5 text-[#e4e4e7]",
	provisioning: "border-sky-500/30 bg-sky-500/10 text-sky-300",
	running: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
	suspended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	failed: "border-red-500/30 bg-red-500/10 text-red-300",
	deleted: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const base = "absolute h-2.5 w-2.5 pointer-events-none";
	const styles: Record<typeof position, string> = {
		tl: `${base} left-0 top-0 border-l border-t border-[#00ff87]/35`,
		tr: `${base} right-0 top-0 border-r border-t border-[#00ff87]/35`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#00ff87]/35`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#00ff87]/35`,
	};

	return <span className={styles[position]} />;
}

function SectionLabel({ children }: { children: string }) {
	return <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#52525b]">{children}</p>;
}

function StatusPill({ label, toneClassName }: { label: string; toneClassName: string }) {
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center gap-1 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em]",
				toneClassName,
			)}
		>
			{label}
		</span>
	);
}

function DetailCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="rounded-sm border border-white/6 bg-[#08080a] px-3 py-2.5">
			<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">{label}</p>
			<p className={cn("mt-1 text-sm text-[#e4e4e7]", mono && "font-mono text-xs sm:text-sm")}>{value}</p>
		</div>
	);
}

function formatRuntimeLabel(value?: string) {
	if (!value) return "—";
	return value.replaceAll("_", " ");
}

function formatReserveUsd(value?: number) {
	if (typeof value !== "number" || Number.isNaN(value)) return "—";
	return formatNumber(value, true);
}

function formatOwnerRouteError(error?: Error) {
	const message = error?.message?.trim();
	if (!message) return "Owner control-plane state is unavailable right now.";
	if (/404|405|not found/i.test(message)) {
		return "Owner control-plane routes are not available on this backend branch yet.";
	}
	return message;
}

export default function OwnerRuntimePanel({ token }: { token: IToken }) {
	const { t } = useTranslation();
	const billingModeOptions = useMemo(() => getBillingModeOptions(t), [t]);
	const queryClient = useQueryClient();
	const connectedWallet = useAddress();
	const [billingMode, setBillingMode] = useState<BillingMode>(token.billingMode ?? "owner_credits");

	const authQueryKey = ["auth-status"] as const;
	const tokenQueryKey = ["token", token.chain, token.chainId, token.contractAddress] as const;
	const ownerRuntimeQueryKey = ["owner-runtime", token.chain, token.chainId, token.contractAddress] as const;
	const ownerBillingQueryKey = ["owner-billing", token.chain, token.chainId, token.contractAddress] as const;
	const creatorAddress = token.creator;
	const claimState: ClaimState = token.ownerClaimStatus ?? "unclaimed";
	const isClaimed = claimState === "claimed" || claimState === "verified";
	const isConnectedCreator = isSameWalletAddress(connectedWallet, creatorAddress ?? null);

	const authQuery = useQuery({
		queryKey: authQueryKey,
		queryFn: getAuthStatus,
		staleTime: 60_000,
		retry: false,
	});

	const authenticatedWallets = useMemo(
		() =>
			[authQuery.data?.wallets?.evm?.address].flatMap((wallet) =>
				wallet ? [String(wallet)] : [],
			),
		[authQuery.data],
	);

	const authenticatedCreatorWallet = useMemo(
		() => authenticatedWallets.find((wallet) => isSameWalletAddress(wallet, creatorAddress ?? null)) ?? null,
		[authenticatedWallets, creatorAddress],
	);

	const canAttemptClaim = Boolean(authenticatedCreatorWallet);
	const canManageRuntime = canAttemptClaim && isClaimed;

	useEffect(() => {
		if (!isConnectedCreator || canAttemptClaim) return;

		const timeout = window.setTimeout(() => {
			void authQuery.refetch();
		}, 1_500);

		return () => window.clearTimeout(timeout);
	}, [authQuery.refetch, canAttemptClaim, isConnectedCreator]);

	const runtimeQuery = useQuery({
		queryKey: ownerRuntimeQueryKey,
		queryFn: () =>
			getOwnerTokenRuntime({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			}),
		enabled: canManageRuntime,
		retry: false,
	});

	const billingQuery = useQuery({
		queryKey: ownerBillingQueryKey,
		queryFn: () =>
			getOwnerTokenBilling({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			}),
		enabled: canManageRuntime,
		retry: false,
	});

	const refreshOwnerState = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: authQueryKey }),
			queryClient.invalidateQueries({ queryKey: tokenQueryKey }),
			queryClient.invalidateQueries({ queryKey: ownerRuntimeQueryKey }),
			queryClient.invalidateQueries({ queryKey: ownerBillingQueryKey }),
		]);
	};

	const claimMutation = useMutation({
		mutationFn: () =>
			claimTokenOwnership({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			}),
		onSuccess: async () => {
			toast.success("Owner access claimed");
			await refreshOwnerState();
		},
		onError: (error: Error) => {
			toast.error(formatOwnerRouteError(error));
		},
	});

	const activateMutation = useMutation({
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
			await refreshOwnerState();
		},
		onError: (error: Error) => {
			toast.error(formatOwnerRouteError(error));
		},
	});

	const suspendMutation = useMutation({
		mutationFn: () =>
			suspendOwnerTokenRuntime({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			}),
		onSuccess: async () => {
			toast.success("Runtime suspended");
			await refreshOwnerState();
		},
		onError: (error: Error) => {
			toast.error(formatOwnerRouteError(error));
		},
	});

	const resumeMutation = useMutation({
		mutationFn: () =>
			resumeOwnerTokenRuntime({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			}),
		onSuccess: async () => {
			toast.success("Runtime resume requested");
			await refreshOwnerState();
		},
		onError: (error: Error) => {
			toast.error(formatOwnerRouteError(error));
		},
	});

	const runtime = runtimeQuery.data?.runtime;
	const billing = billingQuery.data;
	const runtimeStatus = runtime?.agentStatus ?? "none";
	const claimToneClass: string = claimToneMap[claimState] ?? "border-white/10 bg-white/5 text-[#e4e4e7]";
	const runtimeToneClass: string = runtimeToneMap[runtimeStatus] ?? "border-white/10 bg-white/5 text-[#e4e4e7]";
	const anyActionPending =
		claimMutation.isPending || activateMutation.isPending || suspendMutation.isPending || resumeMutation.isPending;

	const showActivate = runtimeStatus === "none" || runtimeStatus === "failed" || runtimeStatus === "deleted";
	const showSuspend = runtimeStatus === "running";
	const showResume = runtimeStatus === "suspended";

	const creatorShort = creatorAddress ? shortenAddress(creatorAddress) : "";
	let ownershipMessage = t("owner.connectAuthenticateMessage");
	if (!creatorAddress) {
		ownershipMessage = t("owner.noCreatorMessage");
	} else if (authQuery.isLoading) {
		ownershipMessage = t("owner.checkingAuth");
	} else if (!authQuery.data?.authenticated) {
		ownershipMessage = isConnectedCreator
			? t("owner.creatorConnectedAuthMessage")
			: t("owner.claimRequiresCreator", { address: creatorShort });
	} else if (!authenticatedCreatorWallet) {
		ownershipMessage = t("owner.walletMismatch", { address: creatorShort });
	} else if (isClaimed) {
		ownershipMessage = t("owner.ownerAccessLinked");
	} else {
		ownershipMessage = t("owner.creatorVerifiedClaim");
	}

	return (
		<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3 sm:p-4 transition-colors hover:border-[rgba(255,255,255,0.12)] min-w-0">
			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />

			<div className="flex flex-col gap-4 sm:gap-5 min-w-0">
				<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
					<div className="space-y-1 min-w-0">
						<SectionLabel>{t("owner.console")}</SectionLabel>
						<div className="flex items-center gap-2">
							<ShieldCheck className="size-4 shrink-0 text-[#00ff87]" />
							<h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e4e4e7] truncate">{t("owner.claimRuntime")}</h3>
						</div>
						<p className="max-w-xl text-xs leading-relaxed text-[#71717a] min-w-0">
							{t("owner.honestAccessNote")}
						</p>
					</div>

					<Button
						variant="outline"
						size="sm"
						className="h-8 px-3 text-[10px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
						onClick={() => {
							void refreshOwnerState();
						}}
						disabled={anyActionPending}
					>
						<RefreshCw className="size-3.5" />
						{t("owner.refresh")}
					</Button>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<DetailCell label={t("owner.claimState")} value={t(`owner.claimValue_${claimState}`)} />
					<DetailCell label={t("owner.creatorWallet")} value={creatorAddress ? shortenAddress(creatorAddress) : "—"} mono />
				</div>

				<div className="space-y-3 rounded-sm border border-white/6 bg-[#0a0a0d] p-3">
					<div className="flex flex-wrap items-center gap-2">
						<StatusPill label={t(`owner.claimValue_${claimState}`)} toneClassName={claimToneClass} />
						{authenticatedCreatorWallet ? (
							<StatusPill
								label={t("owner.creatorAuthenticated")}
								toneClassName="border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]"
							/>
						) : authQuery.data?.authenticated ? (
							<StatusPill label={t("owner.walletMismatchPill")} toneClassName="border-amber-500/30 bg-amber-500/10 text-amber-300" />
						) : (
							<StatusPill label={t("owner.authRequired")} toneClassName="border-white/10 bg-white/5 text-[#e4e4e7]" />
						)}
						{isConnectedCreator && !authenticatedCreatorWallet && (
							<StatusPill label={t("owner.creatorConnectedPill")} toneClassName="border-sky-500/30 bg-sky-500/10 text-sky-300" />
						)}
					</div>

					<div className="flex items-start gap-2 text-xs leading-relaxed text-[#a1a1aa]">
						<Wallet className="mt-0.5 size-3.5 shrink-0 text-[#00ff87]" />
						<p>{ownershipMessage}</p>
					</div>

					<div className="flex flex-wrap gap-2">
						{canAttemptClaim && !isClaimed && (
							<Button
								onClick={() => claimMutation.mutate()}
								disabled={claimMutation.isPending || !creatorAddress}
								className="h-9 px-3 text-[11px] font-mono uppercase"
							>
								{claimMutation.isPending ? (
									<LoaderCircle className="size-3.5 animate-spin" />
								) : (
									<CheckCircle2 className="size-3.5" />
								)}
								{t("owner.claimOwnerAccess")}
							</Button>
						)}

						{!canAttemptClaim && creatorAddress && (
							<div className="rounded-sm border border-white/6 bg-white/5 px-3 py-2 text-[11px] text-[#71717a]">
								{t("owner.onlyCreatorCanClaim")}
							</div>
						)}
					</div>
				</div>

				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<SectionLabel>{t("owner.runtimeStatus")}</SectionLabel>
						<StatusPill label={formatRuntimeLabel(runtimeStatus)} toneClassName={runtimeToneClass} />
					</div>

					{!creatorAddress ? (
						<div className="rounded-sm border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
							{t("owner.noCreatorRuntimeMessage")}
						</div>
					) : !authenticatedCreatorWallet ? (
						<div className="rounded-sm border border-white/8 bg-white/5 p-3 text-xs leading-relaxed text-[#a1a1aa]">
							{t("owner.authFirstMessage")}
						</div>
					) : !isClaimed ? (
						<div className="rounded-sm border border-[#00ff87]/20 bg-[#00ff87]/5 p-3 text-xs leading-relaxed text-[#b6ffd8]">
							{t("owner.claimFirstMessage")}
						</div>
					) : runtimeQuery.isLoading || billingQuery.isLoading ? (
						<div className="flex items-center gap-2 rounded-sm border border-white/8 bg-white/5 p-3 text-xs text-[#a1a1aa]">
							<LoaderCircle className="size-3.5 animate-spin text-[#00ff87]" />
							{t("owner.loadingRuntime")}
						</div>
					) : runtimeQuery.error || billingQuery.error ? (
						<div className="rounded-sm border border-red-500/20 bg-red-500/5 p-3 text-xs leading-relaxed text-red-200/90">
							<div className="flex items-start gap-2">
								<AlertCircle className="mt-0.5 size-3.5 shrink-0" />
								<div className="space-y-2">
									<p>{formatOwnerRouteError(runtimeQuery.error || billingQuery.error || undefined)}</p>
									<Button
										variant="outline"
										size="sm"
										className="h-8 px-3 text-[10px] font-mono uppercase"
										onClick={() => {
											void refreshOwnerState();
										}}
									>
										{t("owner.retry")}
									</Button>
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-3">
							<div className="grid gap-3 md:grid-cols-2">
								<DetailCell label={t("owner.agentStatus")} value={formatRuntimeLabel(runtimeStatus)} />
								<DetailCell
									label={t("owner.lifecycle")}
									value={formatRuntimeLabel(runtime?.agentLifecycleState || token.agentLifecycleState)}
								/>
								<DetailCell
									label={t("owner.billingMode")}
									value={formatRuntimeLabel(billing?.billingMode || runtime?.billingMode || token.billingMode)}
								/>
								<DetailCell
									label={t("owner.infraReserve")}
									value={formatReserveUsd(
										billing?.infraReserveUsd ?? runtime?.infraReserveUsd ?? token.infraReserveUsd,
									)}
								/>
								<DetailCell
									label={t("owner.cloudAgentId")}
									value={runtime?.cloudAgentId ? shortenAddress(runtime.cloudAgentId) : t("owner.notProvisioned")}
									mono
								/>
								<DetailCell label={t("owner.webUi")} value={runtime?.webUiUrl ? t("owner.available") : t("owner.unavailable")} />
							</div>

							<div className="rounded-sm border border-white/6 bg-[#0a0a0d] p-3">
								<label
									className="mb-2 block text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]"
									htmlFor="owner-runtime-billing-mode"
								>
									{t("owner.activationBillingMode")}
								</label>
								<select
									id="owner-runtime-billing-mode"
									value={billingMode}
									onChange={(event) => setBillingMode(event.target.value as BillingMode)}
									className="h-10 w-full rounded-sm border border-white/10 bg-[#08080a] px-3 text-sm text-[#e4e4e7] outline-none transition-colors focus:border-[#00ff87]/40"
									disabled={anyActionPending}
								>
									{billingModeOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
								<p className="mt-2 text-[11px] leading-relaxed text-[#71717a]">
									{billingModeOptions.find((option) => option.value === billingMode)?.description}
								</p>
							</div>

							{runtime?.webUiUrl && (
								<a
									href={runtime.webUiUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-[#00ff87] hover:text-[#7dffc1]"
								>
									<ExternalLink className="size-3.5" />
									{t("owner.openRuntimeUi")}
								</a>
							)}

							<div className="flex flex-wrap gap-2">
								{showActivate && (
									<Button
										onClick={() => activateMutation.mutate()}
										disabled={activateMutation.isPending}
										className="h-9 px-3 text-[11px] font-mono uppercase"
									>
										{activateMutation.isPending ? (
											<LoaderCircle className="size-3.5 animate-spin" />
										) : (
											<PlayCircle className="size-3.5" />
										)}
										{t("owner.activateRuntime")}
									</Button>
								)}

								{showSuspend && (
									<Button
										variant="outline"
										onClick={() => suspendMutation.mutate()}
										disabled={suspendMutation.isPending}
										className="h-9 px-3 text-[11px] font-mono uppercase text-amber-200 hover:text-amber-100"
									>
										{suspendMutation.isPending ? (
											<LoaderCircle className="size-3.5 animate-spin" />
										) : (
											<PauseCircle className="size-3.5" />
										)}
										{t("owner.suspendRuntime")}
									</Button>
								)}

								{showResume && (
									<Button
										onClick={() => resumeMutation.mutate()}
										disabled={resumeMutation.isPending}
										className="h-9 px-3 text-[11px] font-mono uppercase"
									>
										{resumeMutation.isPending ? (
											<LoaderCircle className="size-3.5 animate-spin" />
										) : (
											<RefreshCw className="size-3.5" />
										)}
										{t("owner.resumeRuntime")}
									</Button>
								)}
							</div>

							{runtimeStatus === "provisioning" && (
								<div className="rounded-sm border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-relaxed text-sky-200/90">
									{t("owner.provisioningMessage")}
								</div>
							)}

							{runtimeStatus === "none" && (
								<div className="rounded-sm border border-white/8 bg-white/5 p-3 text-xs leading-relaxed text-[#a1a1aa]">
									{t("owner.noRuntimeMessage")}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
