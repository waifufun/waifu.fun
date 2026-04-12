"use client";

import { PromptProvider } from "@/components/hooks/providers/usePromptContext";
import { FAQAccordion } from "@/components/ui/create-token/faq-accordion";
import { AgentPreviewCard } from "@/components/ui/create-token/agent-preview-card";
import { CreateWizard } from "@/components/ui/create-token/create-wizard";
import { CreateWizardV2 } from "@/components/ui/create-token/create-wizard-v2";
import { ConversationalCreate } from "@/components/ui/create-token/conversational-create";
import { getLaunchGateCheck, isApiUnavailableError } from "@/lib/api";
import { useAccount } from "wagmi";
import { LockKeyhole, RefreshCcw, Rocket, MessageSquare, SlidersHorizontal, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/locale-context";

// ---------------------------------------------------------------------------
// Mode toggle: Conversational vs Manual
// ---------------------------------------------------------------------------
type CreateMode = "conversational" | "manual" | "v2";

function CreateModeToggle({
	mode,
	onModeChange,
}: {
	mode: CreateMode;
	onModeChange: (m: CreateMode) => void;
}) {
	const modes: { id: CreateMode; label: string; icon: typeof MessageSquare }[] = [
		{ id: "conversational", label: "chat", icon: MessageSquare },
		{ id: "manual", label: "manual", icon: SlidersHorizontal },
		{ id: "v2", label: "v2", icon: Zap },
	];

	return (
		<div className="flex items-center justify-end gap-1 max-w-7xl mx-auto px-4 pt-4">
			<div className="flex items-center gap-0 border border-[rgba(255,255,255,0.06)] rounded-sm overflow-hidden">
				{modes.map((m, i) => {
					const Icon = m.icon;
					const isLast = i === modes.length - 1;
					return (
						<button
							key={m.id}
							type="button"
							onClick={() => onModeChange(m.id)}
							className={cn(
								"flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
								mode === m.id
									? "bg-[#00ff87]/10 text-[#00ff87]"
									: "bg-transparent text-[#52525b] hover:text-[#71717a]",
								!isLast && "border-r border-[rgba(255,255,255,0.06)]"
							)}
						>
							<Icon className="w-3 h-3" />
							{m.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Manual create (original wizard layout)
// ---------------------------------------------------------------------------
function ManualCreateLauncher() {
	const { t } = useTranslation();
	return (
		<div className="w-full min-h-[100dvh] bg-[#08080a]">
			<div className="w-full max-w-6xl mx-auto px-4 pt-8 pb-4">
				<div className="text-center mb-8">
					<div className="inline-flex items-center gap-2 mb-3">
						<Rocket className="w-5 h-5 text-[#00ff87]" />
						<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">{t("createPage.agentLaunchpad")}</span>
					</div>
					<h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] mb-2">{t("createPage.deployYourAgent")}</h1>
					<p className="text-sm text-[#71717a] max-w-md mx-auto">
						{t("createPage.deploySubtitle")}
					</p>
				</div>
			</div>

			<div className="w-full max-w-7xl mx-auto px-4 pb-8">
				<div className="grid lg:grid-cols-[1fr_280px] gap-6">
					<div>
						<CreateWizard />
						<FAQAccordion className="mt-8" />
					</div>

					<aside className="hidden lg:block">
						<div className="sticky top-4">
							<AgentPreviewCard />
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Launcher wrapper (mode switch)
// ---------------------------------------------------------------------------
function V2CreateLauncher() {
	return (
		<div className="w-full min-h-[100dvh] bg-[#08080a]">
			<div className="w-full max-w-6xl mx-auto px-4 pt-8 pb-4">
				<div className="text-center mb-8">
					<div className="inline-flex items-center gap-2 mb-3">
						<Zap className="w-5 h-5 text-[#00ff87]" />
						<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">agent factory v2</span>
					</div>
					<h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] mb-2">Deploy your agent</h1>
					<p className="text-sm text-[#71717a] max-w-md mx-auto">
						80/10/10 split. bonding curve. agent treasury. all automatic.
					</p>
				</div>
			</div>
			<div className="w-full max-w-7xl mx-auto px-4 pb-8">
				<CreateWizardV2 />
			</div>
		</div>
	);
}

function CreateTokenLauncher() {
	const [mode, setMode] = useState<CreateMode>("conversational");

	return (
		<div className="w-full min-h-screen bg-[#08080a]">
			<CreateModeToggle mode={mode} onModeChange={setMode} />

			{mode === "conversational" && <ConversationalCreate />}
			{mode === "manual" && <ManualCreateLauncher />}
			{mode === "v2" && <V2CreateLauncher />}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Launch gate (unchanged)
// ---------------------------------------------------------------------------
type LaunchGateCheckResponse = {
	allowed: boolean;
	reason?: string;
	remainingUses?: number;
	accessSource?: "wallet" | "invite" | "disabled";
};

type LaunchGateStatus = "loading" | "allowed" | "denied" | "unavailable";

function CreatePageInner() {
	const { t } = useTranslation();
	const { address, isConnected } = useAccount();
	const walletKey = address;
	const [inviteCodeInput, setInviteCodeInput] = useState("");
	const [validatedInviteCode, setValidatedInviteCode] = useState<string | undefined>(undefined);
	const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
	const [launchGate, setLaunchGate] = useState<{
		status: LaunchGateStatus;
		reason: string | undefined;
	}>({ status: "loading", reason: undefined });
	const retryInviteCode = inviteCodeInput.trim() || validatedInviteCode;

	const checkAccess = useCallback(async (inviteCode?: string) => {
		const trimmedInviteCode = inviteCode?.trim();

		try {
			const response = (await getLaunchGateCheck(trimmedInviteCode)) as LaunchGateCheckResponse;
			setLaunchGate({
				status: response.allowed ? "allowed" : "denied",
				reason: response.reason,
			});

			if (response.allowed && trimmedInviteCode) {
				setValidatedInviteCode(trimmedInviteCode);
			}

			if (!response.allowed && trimmedInviteCode) {
				setValidatedInviteCode(undefined);
			}
		} catch (error) {
			const isUnavailable = isApiUnavailableError(error);
			setLaunchGate({
				status: isUnavailable ? "unavailable" : "denied",
				reason: isUnavailable
					? "Curated launch is being staged right now. Please check back shortly."
					: "Unable to verify curated launch access right now. Please try again.",
			});

			if (!isUnavailable) {
				setValidatedInviteCode(undefined);
			}
		}
	}, []);

	useEffect(() => {
		setLaunchGate((current) => ({ ...current, status: "loading" }));

		const timeout = window.setTimeout(
			() => {
				void checkAccess(validatedInviteCode);
			},
			walletKey ? 900 : 0,
		);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [walletKey, validatedInviteCode, checkAccess]);

	const handleInviteSubmit = async () => {
		const trimmedInviteCode = inviteCodeInput.trim();
		if (!trimmedInviteCode) {
			toast.error("Enter an invite code to continue.");
			return;
		}

		setIsSubmittingInvite(true);
		await checkAccess(trimmedInviteCode);
		setIsSubmittingInvite(false);
	};

	if (launchGate.status === "loading") {
		return (
			<div className="min-h-[100dvh] bg-[#08080a] flex items-center justify-center px-4">
				<div className="w-full max-w-lg border border-[rgba(255,255,255,0.08)] bg-[#111114] rounded-sm p-8 text-center">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.06)] text-[#00ff87] font-mono text-xs uppercase tracking-[0.25em]">
						<LockKeyhole size={14} />
						curated launch
					</div>
					<div className="mt-6 flex justify-center gap-2">
						<span className="w-2 h-2 rounded-full bg-[#00ff87] animate-bounce" />
						<span className="w-2 h-2 rounded-full bg-[#00ff87] animate-bounce [animation-delay:150ms]" />
						<span className="w-2 h-2 rounded-full bg-[#00ff87] animate-bounce [animation-delay:300ms]" />
					</div>
					<p className="mt-4 text-sm text-[#a1a1aa] font-mono uppercase tracking-[0.2em]">checking access</p>
				</div>
			</div>
		);
	}

	if (launchGate.status === "unavailable") {
		return (
			<div className="min-h-[100dvh] bg-[#08080a] px-4 py-10 flex items-center justify-center">
				<div className="w-full max-w-3xl border border-[rgba(255,255,255,0.08)] bg-[#111114] rounded-sm overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.4)]">
					<div className="border-b border-[rgba(255,255,255,0.06)] bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(0,255,135,0.02))] px-6 py-5">
						<div className="inline-flex items-center gap-2 text-[#00ff87] font-mono text-xs uppercase tracking-[0.28em]">
							<LockKeyhole size={14} />
							curated launch
						</div>
						<h1 className="mt-4 text-3xl md:text-4xl font-bold text-[#e4e4e7]">Create is being staged</h1>
						<p className="mt-3 max-w-2xl text-sm md:text-base text-[#a1a1aa] leading-7">
							{launchGate.reason}
						</p>
					</div>

					<div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] p-6 md:p-8">
						<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-5">
							<p className="text-xs font-mono uppercase tracking-[0.22em] text-[#71717a]">what&apos;s happening</p>
							<ul className="mt-4 space-y-3 text-sm text-[#a1a1aa]">
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>Curated launch checks are temporarily offline while backend access is finalized.</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>Your wallet and invite status are not lost; this is a temporary availability issue.</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>Retry in a moment and you&apos;ll be routed into create as soon as checks are live.</span>
								</li>
							</ul>
						</div>

						<div className="space-y-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-5">
							<p className="text-xs font-mono uppercase tracking-[0.22em] text-[#71717a]">launch status</p>
							<p className="text-sm text-[#a1a1aa] leading-6">
								Curated launch is still in rollout mode and this environment is waiting on API availability.
							</p>
							<button
								type="button"
								onClick={() => void checkAccess(retryInviteCode)}
								className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[rgba(0,255,135,0.24)] px-4 py-3 text-center text-sm font-mono uppercase tracking-[0.18em] text-[#00ff87] transition hover:bg-[rgba(0,255,135,0.08)]"
							>
								<RefreshCcw size={14} />
								Retry access check
							</button>
							{retryInviteCode && (
								<p className="text-xs text-[#71717a] leading-5">
									Retry will reuse invite code: <span className="font-mono text-[#a1a1aa]">{retryInviteCode}</span>
								</p>
							)}
							{!isConnected && (
								<p className="text-xs text-[#71717a] leading-5">
									Tip: connect your wallet in the site header before retrying launch access.
								</p>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (launchGate.status === "denied") {
		return (
			<div className="min-h-[100dvh] bg-[#08080a] px-4 py-10 flex items-center justify-center">
				<div className="w-full max-w-3xl border border-[rgba(255,255,255,0.08)] bg-[#111114] rounded-sm overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.4)]">
					<div className="border-b border-[rgba(255,255,255,0.06)] bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(0,255,135,0.02))] px-6 py-5">
						<div className="inline-flex items-center gap-2 text-[#00ff87] font-mono text-xs uppercase tracking-[0.28em]">
							<LockKeyhole size={14} />
							curated launch
						</div>
						<h1 className="mt-4 text-3xl md:text-4xl font-bold text-[#e4e4e7]">waifu.fun is in curated launch</h1>
						<p className="mt-3 max-w-2xl text-sm md:text-base text-[#a1a1aa] leading-7">
							We&apos;re onboarding select creators. Enter an invite code or apply for access.
						</p>
					</div>

					<div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr] p-6 md:p-8">
						<div className="space-y-5">
							<div className="space-y-2">
								<label
									htmlFor="inviteCode"
									className="block text-xs font-mono uppercase tracking-[0.24em] text-[#71717a]"
								>
									Invite code
								</label>
								<div className="flex flex-col sm:flex-row gap-3">
									<input
										id="inviteCode"
										type="text"
										value={inviteCodeInput}
										onChange={(event) => setInviteCodeInput(event.target.value.toUpperCase())}
										placeholder="WAIFU-XXXXXXX"
										className="flex-1 h-12 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#08080a] px-4 text-[#e4e4e7] font-mono placeholder:text-[#52525b] outline-none focus:border-[#00ff87] focus:ring-2 focus:ring-[#00ff87]/20"
									/>
									<button
										type="button"
										onClick={handleInviteSubmit}
										disabled={isSubmittingInvite}
										className="h-12 rounded-sm bg-[#00ff87] px-5 font-mono font-bold uppercase tracking-[0.18em] text-[#08080a] transition hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:bg-[#1f1f23] disabled:text-[#71717a]"
									>
										{isSubmittingInvite ? "Checking..." : "Unlock create"}
									</button>
								</div>
							</div>

							<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-4">
								<p className="text-xs font-mono uppercase tracking-[0.22em] text-[#71717a]">status</p>
								<p className="mt-2 text-sm text-[#a1a1aa] leading-6">
									{launchGate.reason || "This wallet does not have launch access yet."}
								</p>
								{validatedInviteCode && (
									<p className="mt-3 text-xs font-mono uppercase tracking-[0.18em] text-[#00ff87]">
										Invite accepted: {validatedInviteCode}
									</p>
								)}
							</div>
						</div>

						<div className="space-y-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-5">
							<p className="text-xs font-mono uppercase tracking-[0.22em] text-[#71717a]">launch notes</p>
							<ul className="space-y-3 text-sm text-[#a1a1aa]">
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>{t("createPage.launchNote1")}</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>{t("createPage.launchNote2")}</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>{t("createPage.launchNote3")}</span>
								</li>
							</ul>

							{!isConnected && (
								<p className="text-xs text-[#71717a] leading-5">
									{t("createPage.connectWalletTip")}
								</p>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<PromptProvider inviteCode={validatedInviteCode}>
			<CreateTokenLauncher />
		</PromptProvider>
	);
}

export default function CreateTokenPage() {
	return <CreatePageInner />;
}
