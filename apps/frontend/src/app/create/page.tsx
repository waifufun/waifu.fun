"use client";

import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
import AutoCreateForm from "@/components/ui/create-token/auto-create-form";
import { FAQAccordion } from "@/components/ui/create-token/faq-accordion";
import ImportTokenForm from "@/components/ui/create-token/import-token-form";
import ManualCreateForm from "@/components/ui/create-token/manual-create-form";
import { RecentlyCreated } from "@/components/ui/create-token/recently-created";
import { StepProgress } from "@/components/ui/create-token/step-progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLaunchGateCheck, isApiUnavailableError } from "@/lib/api";
import { useAccount } from "wagmi";
import { Download, LockKeyhole, RefreshCcw, Settings2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const steps = [
	{ label: "choose", description: "pick a mode" },
	{ label: "create", description: "configure token" },
	{ label: "launch", description: "deploy to chain" },
];

function CreateTokenLauncher() {
	const [activeTab, setActiveTab] = useState("auto");
	const { launchSalt, isLaunching, previousImages } = usePrompt();

	const currentStep = useMemo(() => {
		if (isLaunching) return 2;
		if (launchSalt || (previousImages && previousImages.length > 0)) return 1;
		return 0;
	}, [launchSalt, isLaunching, previousImages]);

	return (
		<div className="w-full min-h-screen bg-[#08080a]">
			<div className="w-full max-w-6xl mx-auto px-4 pt-8 pb-4">
				<div className="text-center mb-8">
					<div className="inline-flex items-center gap-2 mb-3">
						<Sparkles className="w-5 h-5 text-[#00ff87]" />
						<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">token launcher</span>
					</div>
					<h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] mb-2">Create Your Token</h1>
					<p className="text-sm text-[#71717a] max-w-md mx-auto">
						Launch your token on BSC in minutes. AI-powered image generation, custom vanity addresses, and instant
						deployment.
					</p>
				</div>
				<StepProgress steps={steps} currentStep={currentStep} className="max-w-md mx-auto mb-8" />
			</div>

			<div className="w-full max-w-7xl mx-auto px-4 pb-8">
				<div className="grid lg:grid-cols-[1fr_280px] gap-6">
					<div>
						<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
							<TabsList className="grid w-full grid-cols-3 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm mb-6 p-1">
								<TabsTrigger
									value="auto"
									className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"
								>
									<Wand2 size={14} />
									<span>Auto</span>
									{activeTab === "auto" && (
										<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />
									)}
								</TabsTrigger>
								<TabsTrigger
									value="manual"
									className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"
								>
									<Settings2 size={14} />
									<span>Manual</span>
									{activeTab === "manual" && (
										<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />
									)}
								</TabsTrigger>
								<TabsTrigger
									value="import"
									className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"
								>
									<Download size={14} />
									<span>Import</span>
									{activeTab === "import" && (
										<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />
									)}
								</TabsTrigger>
							</TabsList>
							<TabsContent value="auto" className="mt-0">
								<AutoCreateForm />
							</TabsContent>
							<TabsContent value="manual" className="mt-0">
								<ManualCreateForm />
							</TabsContent>
							<TabsContent value="import" className="mt-0">
								<ImportTokenForm />
							</TabsContent>
						</Tabs>
						<FAQAccordion className="mt-8" />
					</div>

					<aside className="hidden lg:block">
						<div className="sticky top-4">
							<RecentlyCreated />
						</div>
					</aside>
				</div>

				<div className="lg:hidden mt-8">
					<RecentlyCreated />
				</div>
			</div>
		</div>
	);
}

type LaunchGateCheckResponse = {
	allowed: boolean;
	reason?: string;
	remainingUses?: number;
	accessSource?: "wallet" | "invite" | "disabled";
};

type LaunchGateStatus = "loading" | "allowed" | "denied" | "unavailable";

function CreatePageInner() {
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
			<div className="min-h-screen bg-[#08080a] flex items-center justify-center px-4">
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
			<div className="min-h-screen bg-[#08080a] px-4 py-10 flex items-center justify-center">
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
			<div className="min-h-screen bg-[#08080a] px-4 py-10 flex items-center justify-center">
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
									<span>Only approved creators can access the full token launch flow right now.</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>Connect and sign with your wallet in the header before checking an invite code.</span>
								</li>
								<li className="flex items-start gap-3">
									<span className="mt-1 h-2 w-2 rounded-full bg-[#00ff87]" />
									<span>Need access? Watch for curated launch updates and new creator onboarding windows.</span>
								</li>
							</ul>

							{!isConnected && (
								<p className="text-xs text-[#71717a] leading-5">
									Tip: connect your wallet in the site header first, then enter your invite code here.
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
