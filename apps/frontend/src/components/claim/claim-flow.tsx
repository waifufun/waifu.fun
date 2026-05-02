"use client";

import { AlertCircle, ArrowRight, Check, Loader2, Pencil, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { parseEther } from "viem";
import { bsc } from "viem/chains";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";

import { ConnectXButton } from "@/components/auth/connect-x-button";
import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { Button } from "@/components/ui/button";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { usePatronAuth } from "@/contexts/auth-context";
import { type ClaimInfo, claimAgent, editClaim, fetchClaimInfo, launchClaimed } from "@/lib/claim-api";

type Step = "needs-x" | "claiming" | "needs-fund" | "funding" | "launching" | "done" | "error";

export default function ClaimFlow({
	claimToken,
	initialInfo,
}: {
	claimToken: string;
	initialInfo: ClaimInfo;
}) {
	const router = useRouter();
	const { patronUser, isLoading: authLoading } = usePatronAuth();
	const [info, setInfo] = useState<ClaimInfo>(initialInfo);
	const [step, setStep] = useState<Step>(() => initialInfo.claimStatus as Step);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [fundAmountBnb, setFundAmountBnb] = useState<string>("0.01");

	const isAlreadyClaimed = useMemo(
		() =>
			info.claimedByXHandle !== null &&
			patronUser !== null &&
			patronUser !== undefined &&
			info.claimedByXHandle.toLowerCase() === patronUser.xHandle.toLowerCase(),
		[info.claimedByXHandle, patronUser],
	);

	// Auto-advance: if patron is logged in and claim is still 'needs-x', trigger claim.
	useEffect(() => {
		let cancelled = false;
		async function maybeClaim() {
			if (authLoading) return;
			if (!patronUser) return;
			if (step !== "needs-x") return;
			if (info.claimStatus === "needs-fund" && isAlreadyClaimed) {
				setStep("needs-fund");
				return;
			}
			if (info.claimStatus === "needs-x") {
				setStep("claiming");
				const res = await claimAgent(claimToken);
				if (cancelled) return;
				if (!res.ok) {
					setErrorMsg(res.error ?? "claim failed");
					setStep("error");
					return;
				}
				const refreshed = await fetchClaimInfo(claimToken);
				if (cancelled) return;
				if (refreshed.info) setInfo(refreshed.info);
				setStep("needs-fund");
			}
		}
		maybeClaim();
		return () => {
			cancelled = true;
		};
	}, [authLoading, patronUser, step, info.claimStatus, isAlreadyClaimed, claimToken]);

	async function onLaunch(txHash?: string) {
		setStep("launching");
		setErrorMsg(null);
		const res = await launchClaimed(claimToken, {
			...(txHash ? { fundAmountBnb, fundTxHash: txHash } : {}),
		});
		if (!res.ok || !res.tokenAddress) {
			setErrorMsg(res.error ?? "launch failed");
			setStep("error");
			return;
		}
		setStep("done");
		toast.success("live. taking you to the agent.");
		setTimeout(() => {
			router.push(`/agent/${res.tokenAddress}`);
		}, 1200);
	}

	const canEdit = step === "needs-fund";

	async function onEditSave(next: {
		name: string;
		symbol: string;
		description: string;
		imageUrl: string;
		webUrl: string;
		twitterUrl: string;
		telegramUrl: string;
		tax: {
			feeRate: 1 | 3 | 5 | 10;
			recipient: "agent" | "patron";
		};
	}) {
		const patronAddr = patronUser?.xUserId ? undefined : undefined;
		const res = await editClaim(claimToken, {
			name: next.name,
			symbol: next.symbol,
			description: next.description,
			imageUrl: next.imageUrl,
			webUrl: next.webUrl,
			twitterUrl: next.twitterUrl,
			telegramUrl: next.telegramUrl,
			tax: {
				feeRate: next.tax.feeRate,
				recipient: next.tax.recipient,
				// When recipient='patron' we'd need the patron's wallet address.
				// For v1 we only support 'agent' (self-fund) via the UI. 'patron'
				// is reserved for later when we pipe the wagmi wallet here.
				...(next.tax.recipient === "patron" && patronAddr ? { recipientAddress: patronAddr } : {}),
			},
		});
		if (!res.ok) {
			toast.error(res.error ?? "edit failed");
			return;
		}
		const refreshed = await fetchClaimInfo(claimToken);
		if (refreshed.info) setInfo(refreshed.info);
		toast.success("updated.");
	}

	return (
		<div className="space-y-5">
			<AgentCard agent={info.agent} tax={info.tax} editable={canEdit} onSave={onEditSave} />

			{step === "needs-x" && !patronUser && <NeedsXSection />}

			{step === "claiming" && <PendingCard label="recording your patronage..." />}

			{step === "needs-fund" && info.launchEnabled === false && <LaunchesPausedCard />}

			{step === "needs-fund" && info.launchEnabled !== false && (
				<NeedsFundSection
					agent={info.agent}
					fundAmountBnb={fundAmountBnb}
					setFundAmountBnb={setFundAmountBnb}
					onSkip={() => onLaunch(undefined)}
					onFunded={(hash) => {
						onLaunch(hash);
					}}
					onError={(msg) => {
						setErrorMsg(msg);
						setStep("error");
					}}
				/>
			)}

			{step === "launching" && <PendingCard label="launching..." sub="broadcasting to bsc. about 30 seconds." />}

			{step === "done" && (
				<div className="border border-[#00ff87]/30 bg-[#00ff87]/5 rounded-sm p-6 text-center">
					<Check className="w-6 h-6 text-[#00ff87] mx-auto mb-3" strokeWidth={1.5} />
					<div className="text-sm text-[#00ff87]">live. taking you to the agent.</div>
				</div>
			)}

			{step === "error" && (
				<div className="border border-red-500/30 bg-red-500/5 rounded-sm p-5">
					<div className="flex items-start gap-3">
						<AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" strokeWidth={1.5} />
						<div className="flex-1 min-w-0">
							<div className="text-sm text-red-400">something broke.</div>
							<div className="text-xs text-white/50 mt-1 font-mono break-all">{errorMsg}</div>
							<button
								type="button"
								onClick={() => {
									setErrorMsg(null);
									setStep(info.claimStatus as Step);
								}}
								className="mt-3 text-[11px] font-mono uppercase tracking-[0.16em] text-white/70 hover:text-white underline"
							>
								retry
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function AgentCard({
	agent,
	tax,
	editable,
	onSave,
}: {
	agent: ClaimInfo["agent"];
	tax: ClaimInfo["tax"];
	editable: boolean;
	onSave: (next: {
		name: string;
		symbol: string;
		description: string;
		imageUrl: string;
		webUrl: string;
		twitterUrl: string;
		telegramUrl: string;
		tax: {
			feeRate: 1 | 3 | 5 | 10;
			recipient: "agent" | "patron";
		};
	}) => Promise<void>;
}) {
	const [editMode, setEditMode] = useState(false);
	const [saving, setSaving] = useState(false);
	const [draftName, setDraftName] = useState(agent.name);
	const [draftSymbol, setDraftSymbol] = useState(agent.ticker ?? "");
	const [draftBio, setDraftBio] = useState(agent.bio ?? "");
	const [draftImage, setDraftImage] = useState(agent.imageUrl ?? "");
	const [draftWebUrl, setDraftWebUrl] = useState(agent.webUrl ?? "https://waifu.fun");
	const [draftTwitterUrl, setDraftTwitterUrl] = useState(agent.twitterUrl ?? "https://x.com/waifudotfun");
	const [draftTelegramUrl, setDraftTelegramUrl] = useState(agent.telegramUrl ?? "");
	const [draftFeeRate, setDraftFeeRate] = useState<1 | 3 | 5 | 10>((tax?.feeRate as 1 | 3 | 5 | 10) ?? 5);
	const [draftRecipient, setDraftRecipient] = useState<"agent" | "patron">("agent");

	useEffect(() => {
		if (!editMode) {
			setDraftName(agent.name);
			setDraftSymbol(agent.ticker ?? "");
			setDraftBio(agent.bio ?? "");
			setDraftImage(agent.imageUrl ?? "");
			setDraftWebUrl(agent.webUrl ?? "https://waifu.fun");
			setDraftTwitterUrl(agent.twitterUrl ?? "https://x.com/waifudotfun");
			setDraftTelegramUrl(agent.telegramUrl ?? "");
			setDraftFeeRate((tax?.feeRate as 1 | 3 | 5 | 10) ?? 5);
		}
	}, [
		agent.name,
		agent.ticker,
		agent.bio,
		agent.imageUrl,
		agent.webUrl,
		agent.twitterUrl,
		agent.telegramUrl,
		tax?.feeRate,
		editMode,
	]);

	async function onSaveClick() {
		setSaving(true);
		try {
			await onSave({
				name: draftName,
				symbol: draftSymbol,
				description: draftBio,
				imageUrl: draftImage,
				webUrl: draftWebUrl,
				twitterUrl: draftTwitterUrl,
				telegramUrl: draftTelegramUrl,
				tax: { feeRate: draftFeeRate, recipient: draftRecipient },
			});
			setEditMode(false);
		} finally {
			setSaving(false);
		}
	}

	if (editMode) {
		return (
			<div className="border border-[#00ff87]/30 bg-[#08080a] rounded-sm p-5 md:p-6 space-y-4">
				<div className="flex items-center justify-between">
					<div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#00ff87]">editing</div>
					<button
						type="button"
						onClick={() => setEditMode(false)}
						className="text-white/40 hover:text-white/80"
						disabled={saving}
						aria-label="cancel edit"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</div>

				<div className="flex items-start gap-4">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={draftImage || "/brand/icon/icon_on_black_512.png"}
						alt="preview"
						className="w-20 h-20 shrink-0 object-cover rounded-sm border border-white/10 bg-black/40"
					/>
					<div className="flex-1 min-w-0">
						<input
							type="url"
							value={draftImage}
							onChange={(e) => setDraftImage(e.target.value)}
							placeholder="https://example.com/image.png"
							className="w-full h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-xs font-mono focus:outline-none focus:border-[#00ff87]/40"
							disabled={saving}
						/>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<input
						type="text"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						placeholder="name"
						className="flex-1 h-10 px-3 rounded-sm bg-black/40 border border-white/10 text-base focus:outline-none focus:border-[#00ff87]/40"
						maxLength={80}
						disabled={saving}
					/>
					<input
						type="text"
						value={draftSymbol}
						onChange={(e) => setDraftSymbol(e.target.value.toUpperCase())}
						placeholder="TICKER"
						className="w-28 h-10 px-3 rounded-sm bg-black/40 border border-[#00ff87]/30 text-sm font-mono tracking-wider text-[#00ff87] focus:outline-none focus:border-[#00ff87]"
						maxLength={10}
						disabled={saving}
					/>
				</div>

				<textarea
					value={draftBio}
					onChange={(e) => setDraftBio(e.target.value)}
					placeholder="bio"
					rows={3}
					maxLength={500}
					className="w-full px-3 py-2 rounded-sm bg-black/40 border border-white/10 text-sm leading-relaxed focus:outline-none focus:border-[#00ff87]/40 resize-none"
					disabled={saving}
				/>

				{/* social + web links */}
				<div className="border-t border-white/5 pt-4 space-y-2">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">links</div>
					<input
						type="url"
						value={draftWebUrl}
						onChange={(e) => setDraftWebUrl(e.target.value)}
						placeholder="website (https://...)"
						className="w-full h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-xs font-mono focus:outline-none focus:border-[#00ff87]/40"
						disabled={saving}
					/>
					<input
						type="url"
						value={draftTwitterUrl}
						onChange={(e) => setDraftTwitterUrl(e.target.value)}
						placeholder="x / twitter url"
						className="w-full h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-xs font-mono focus:outline-none focus:border-[#00ff87]/40"
						disabled={saving}
					/>
					<input
						type="url"
						value={draftTelegramUrl}
						onChange={(e) => setDraftTelegramUrl(e.target.value)}
						placeholder="telegram url (optional)"
						className="w-full h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-xs font-mono focus:outline-none focus:border-[#00ff87]/40"
						disabled={saving}
					/>
				</div>

				{/* tax config */}
				<div className="border-t border-white/5 pt-4 space-y-2">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">tax on every trade</div>
					<div className="flex items-center gap-2">
						<select
							value={draftFeeRate}
							onChange={(e) => setDraftFeeRate(Number(e.target.value) as 1 | 3 | 5 | 10)}
							disabled={saving}
							className="h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-sm font-mono focus:outline-none focus:border-[#00ff87]/40"
						>
							<option value={1}>1% fee</option>
							<option value={3}>3% fee</option>
							<option value={5}>5% fee</option>
							<option value={10}>10% fee</option>
						</select>
						<span className="text-[11px] font-mono text-white/40">→</span>
						<select
							value={draftRecipient}
							onChange={(e) => setDraftRecipient(e.target.value as "agent" | "patron")}
							disabled={saving}
							className="flex-1 h-9 px-3 rounded-sm bg-black/40 border border-white/10 text-sm font-mono focus:outline-none focus:border-[#00ff87]/40"
						>
							<option value="agent">agent (self-fund)</option>
							<option value="patron" disabled>
								patron (soon)
							</option>
						</select>
					</div>
					<div className="text-[10px] font-mono text-white/35 leading-relaxed">
						fees route to the agent's wallet. every trade extends its life. higher tax = more runway, less trading
						volume.
					</div>
				</div>

				<div className="flex items-center gap-3">
					<Button
						onClick={onSaveClick}
						disabled={saving}
						className="flex-1 bg-[#00ff87] text-black hover:bg-[#00ff87]/90 rounded-sm"
					>
						{saving ? (
							<>
								<Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
								saving...
							</>
						) : (
							<>
								<Check className="w-4 h-4 mr-1.5" />
								save
							</>
						)}
					</Button>
					<Button
						onClick={() => setEditMode(false)}
						disabled={saving}
						variant="outline"
						className="rounded-sm border-white/10 text-white/70 hover:text-white"
					>
						cancel
					</Button>
				</div>
				<div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/40">
					saving re-signs the launch with four.meme. takes a few seconds.
				</div>
			</div>
		);
	}

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 md:p-6 relative">
			{editable && (
				<button
					type="button"
					onClick={() => setEditMode(true)}
					className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] text-white/50 hover:text-[#00ff87] hover:bg-[#00ff87]/5 transition-colors"
					aria-label="edit agent"
				>
					<Pencil className="w-3 h-3" strokeWidth={1.5} />
					edit
				</button>
			)}
			<div className="flex items-start gap-5">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={agent.imageUrl ?? "/brand/icon/icon_on_black_512.png"}
					alt={agent.name}
					className="w-20 h-20 md:w-24 md:h-24 shrink-0 object-cover rounded-sm border border-white/10 bg-black/40"
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-lg md:text-xl tracking-tight truncate">{agent.name}</span>
						{agent.ticker && (
							<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono tracking-wider text-[#00ff87] border border-[#00ff87]/30 bg-[#00ff87]/5">
								${agent.ticker}
							</span>
						)}
					</div>
					{agent.bio && (
						<p className="text-xs md:text-sm text-white/55 leading-relaxed mt-2 line-clamp-4">{agent.bio}</p>
					)}
					{tax && (
						<div className="mt-3 text-[10px] font-mono uppercase tracking-[0.16em] text-white/40">
							{tax.feeRate}% tax routes to agent wallet
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function NeedsXSection() {
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-6 text-center space-y-4">
			<div>
				<div className="text-base md:text-lg">sign in to claim</div>
				<div className="text-xs md:text-sm text-white/50 mt-2 max-w-md mx-auto">
					you'll become the on-record patron for this agent. your x handle gets attributed to the launch.
				</div>
			</div>
			<div className="flex justify-center">
				<ConnectXButton />
			</div>
		</div>
	);
}

function NeedsFundSection({
	agent,
	fundAmountBnb,
	setFundAmountBnb,
	onSkip,
	onFunded,
	onError,
}: {
	agent: ClaimInfo["agent"];
	fundAmountBnb: string;
	setFundAmountBnb: (v: string) => void;
	onSkip: () => void;
	onFunded: (hash: string) => void;
	onError: (msg: string) => void;
}) {
	const { address, isConnected, chain } = useAccount();
	const auth = useWaifuAuth();
	const { sendTransactionAsync, isPending: sendPending } = useSendTransaction();
	const { switchChainAsync } = useSwitchChain();
	const [isSending, setIsSending] = useState(false);

	if (!agent.walletAddress) {
		// Fall back to skip-only if wallet address isn't set (shouldn't happen in prod).
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-6 text-center">
				<div className="text-sm text-white/60 mb-4">agent wallet unavailable. launching without funding.</div>
				<Button onClick={onSkip} className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90 rounded-sm">
					launch now
				</Button>
			</div>
		);
	}

	async function onFund() {
		if (!auth.isAuthenticated) {
			onError("sign in first");
			return;
		}
		if (!isConnected || !address) {
			onError("link an external wallet first");
			return;
		}
		const numeric = Number(fundAmountBnb);
		if (!Number.isFinite(numeric) || numeric <= 0) {
			onError("enter a positive bnb amount");
			return;
		}
		try {
			setIsSending(true);
			if (chain?.id !== bsc.id) {
				await switchChainAsync({ chainId: bsc.id });
			}
			const hash = await sendTransactionAsync({
				to: agent.walletAddress as `0x${string}`,
				value: parseEther(fundAmountBnb),
				chainId: bsc.id,
			});
			onFunded(hash);
		} catch (err) {
			onError(err instanceof Error ? err.message : "transaction failed");
		} finally {
			setIsSending(false);
		}
	}

	const sending = sendPending || isSending;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 md:p-6 space-y-4">
			<div>
				<div className="text-base md:text-lg">fund the launch (optional)</div>
				<div className="text-xs md:text-sm text-white/50 mt-2">
					send bnb to the agent's wallet. it'll use these funds for liquidity and buybacks. you can skip this.
				</div>
			</div>

			<div className="flex items-center gap-2 text-[11px] font-mono text-white/50 border border-white/10 rounded-sm bg-black/30 p-3">
				<Wallet className="w-3.5 h-3.5 text-white/40 shrink-0" strokeWidth={1.5} />
				<span className="truncate">{agent.walletAddress}</span>
			</div>

			<div className="flex items-center gap-2">
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={fundAmountBnb}
					onChange={(e) => setFundAmountBnb(e.target.value)}
					className="flex-1 h-10 px-3 rounded-sm bg-black/40 border border-white/10 text-sm font-mono focus:outline-none focus:border-[#00ff87]/40"
					placeholder="0.01"
					disabled={sending}
				/>
				<span className="text-xs font-mono text-white/40">BNB</span>
			</div>

			<div className="flex items-center gap-3">
				{!auth.isAuthenticated || !isConnected ? (
					<LinkedEoaCTA className="flex-1 bg-[#00ff87] text-black hover:bg-[#00ff87]/90 rounded-sm">
						{auth.isAuthenticated ? "Link external wallet" : "Sign in"}
					</LinkedEoaCTA>
				) : (
					<Button
						onClick={onFund}
						disabled={sending}
						className="flex-1 bg-[#00ff87] text-black hover:bg-[#00ff87]/90 rounded-sm"
					>
						{sending ? (
							<>
								<Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
								sending...
							</>
						) : (
							<>
								fund and launch
								<ArrowRight className="w-4 h-4 ml-1.5" />
							</>
						)}
					</Button>
				)}
				<Button
					onClick={onSkip}
					disabled={sending}
					variant="outline"
					className="rounded-sm border-white/10 text-white/70 hover:text-white"
				>
					skip
				</Button>
			</div>

			{!isConnected && (
				<div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/40">
					link an external wallet to fund. or skip to launch with zero funding.
				</div>
			)}
		</div>
	);
}

function PendingCard({ label, sub }: { label: string; sub?: string }) {
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-8 text-center">
			<Loader2 className="w-6 h-6 text-[#00ff87] animate-spin mx-auto mb-3" strokeWidth={1.5} />
			<div className="text-sm text-white/80">{label}</div>
			{sub && <div className="text-xs text-white/40 mt-2">{sub}</div>}
		</div>
	);
}

/**
 * Rendered when the backend's LAUNCH_BROADCAST_ENABLED flag is off.
 * Every other step of the claim flow (X OAuth, attribution, editing
 * name/symbol/bio/image/socials/tax) still works; only the final
 * broadcast-to-BSC step is gated. We show this in place of the
 * fund/skip buttons so nobody tries to press "launch" and gets a 503.
 */
function LaunchesPausedCard() {
	return (
		<div className="border border-amber-500/25 bg-amber-500/[0.04] rounded-sm p-6 space-y-3">
			<div className="flex items-center gap-2">
				<span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300/80">
					launches temporarily paused
				</div>
			</div>
			<div className="text-sm text-white/75 leading-relaxed">
				live token broadcasts are parked while we polish the flow. your claim is saved and your edits will stick. come
				back in a bit to finish the launch.
			</div>
			<div className="text-xs text-white/40 leading-relaxed">
				this is a soft switch on our side. nothing is wrong with your claim.
			</div>
		</div>
	);
}
