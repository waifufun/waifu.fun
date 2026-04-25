"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useStewardStatus } from "@/lib/api/steward";
import StewardConnectModal from "./steward-connect-modal";

const DISMISS_KEY = "waifu-steward-onboarding-dismissed";

type Props = {
	hasAgents: boolean;
};

export default function StewardOnboardingBanner({ hasAgents }: Props) {
	const { status } = useStewardStatus();
	const [dismissed, setDismissed] = useState<boolean | null>(null);
	const [modalOpen, setModalOpen] = useState(false);

	// Read dismissal state on the client to avoid hydration mismatch.
	useEffect(() => {
		try {
			setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
		} catch {
			setDismissed(false);
		}
	}, []);

	if (dismissed === null) return null; // pre-hydration: render nothing
	if (dismissed) return null;
	if (!hasAgents) return null;
	if (status.isLoading) return null;
	if (status.data?.connected) return null;

	const handleDismiss = () => {
		setDismissed(true);
		try {
			window.localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// ignore quota / private-mode errors
		}
	};

	return (
		<>
			<section
				className="relative mb-6 overflow-hidden rounded-sm border border-[#00ff87]/25 bg-[#0a1410] p-5 sm:p-6"
				aria-label="Steward onboarding"
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-[0.18]"
					style={{
						background: "radial-gradient(circle, rgba(0,255,135,0.55), transparent 70%)",
					}}
				/>
				<div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]">
							<Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
						</span>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#00ff87]">one-time setup</span>
							</div>
							<h2 className="text-base sm:text-lg font-medium text-white tracking-tight leading-tight">
								Connect Steward to unlock multi-agent management
							</h2>
							<p className="text-sm text-neutral-400 leading-relaxed max-w-[60ch]">
								Steward links your wallet to a single account that owns all your agents. Email recovery, shared keys,
								one login.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 sm:shrink-0">
						<button
							type="button"
							onClick={() => setModalOpen(true)}
							className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/10 px-4 py-2 text-xs font-medium text-[#bff7d6] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-[#00ff87]/20 active:scale-[0.98]"
						>
							Connect Steward
						</button>
						<button
							type="button"
							onClick={handleDismiss}
							aria-label="Dismiss Steward onboarding banner"
							className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
						</button>
					</div>
				</div>
			</section>
			<StewardConnectModal open={modalOpen} onOpenChange={setModalOpen} />
		</>
	);
}
