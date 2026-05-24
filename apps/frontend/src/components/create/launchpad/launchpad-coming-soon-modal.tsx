"use client";

import { useTranslation } from "@/contexts/locale-context";
import { postWaitlistSignup } from "@/hooks/use-launchpads";
import type { LaunchpadDescriptor } from "@/lib/launchpad/types";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { getComingSoonCopy } from "./coming-soon-copy";
import { CloseIcon } from "./launchpad-icons";

type Props = {
	descriptor: LaunchpadDescriptor | null;
	open: boolean;
	onClose: () => void;
};

type Status =
	| { kind: "idle" }
	| { kind: "submitting" }
	| { kind: "success"; email: string }
	| { kind: "already"; email: string }
	| { kind: "error"; message: string };

const CHAIN_LABEL: Record<string, string> = {
	bsc: "BSC",
	solana: "Solana",
	base: "Base",
	ethereum: "Ethereum",
};

export function LaunchpadComingSoonModal({ descriptor, open, onClose }: Props) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const titleId = useId();
	const descId = useId();
	const helperId = useId();
	const copy = useMemo(() => (descriptor ? getComingSoonCopy(descriptor.id) : null), [descriptor]);

	useEffect(() => {
		if (!open) {
			const t = window.setTimeout(() => {
				setEmail("");
				setStatus({ kind: "idle" });
			}, 250);
			return () => window.clearTimeout(t);
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			if (!descriptor || status.kind === "submitting") return;
			setStatus({ kind: "submitting" });
			const result = await postWaitlistSignup(descriptor.id, email);
			if (result.ok) {
				setStatus(
					result.status === "already"
						? { kind: "already", email: result.email }
						: { kind: "success", email: result.email },
				);
			} else {
				setStatus({ kind: "error", message: result.error });
			}
		},
		[descriptor, email, status.kind],
	);

	const joined = status.kind === "success" || status.kind === "already";

	return (
		<AnimatePresence>
			{open && descriptor && copy ? (
				<motion.dialog
					key="overlay"
					open
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
					className="fixed inset-0 z-50 flex h-auto max-h-none w-full max-w-none items-end justify-center bg-transparent px-3 py-3 text-left sm:items-center sm:px-4"
					aria-modal="true"
					aria-labelledby={titleId}
					aria-describedby={descId}
				>
					<button
						type="button"
						aria-label={t("wizard.launchpad.closeWaitlistAria")}
						onClick={onClose}
						className="absolute inset-0 bg-[#050507]/80 backdrop-blur-sm cursor-default"
					/>

					<motion.div
						key="dialog"
						initial={{ opacity: 0, y: 18, scale: 0.985 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 10, scale: 0.985 }}
						transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
						className={cn(
							"relative w-full max-w-[560px] overflow-hidden border border-white/10 bg-[#0a0a0c]",
							"max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] sm:p-6",
						)}
					>
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">waitlist</p>
								<h2 id={titleId} className="mt-2 text-xl text-white tracking-tight lowercase sm:text-2xl">
									{copy.modalTitle}
								</h2>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label={t("wizard.common.close")}
								className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center border border-white/10 text-neutral-500 transition-all duration-200 hover:border-white/25 hover:text-white active:translate-y-[1px]"
							>
								<CloseIcon className="h-4 w-4" />
							</button>
						</div>

						<div className="mt-5 grid gap-3 border-y border-white/8 py-4 sm:grid-cols-[1.2fr_0.8fr]">
							<div>
								<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">platform</p>
								<p className="mt-1 text-sm text-white lowercase">{descriptor.displayName}</p>
							</div>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
								<div>
									<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">chain</p>
									<p className="mt-1 text-xs font-mono text-neutral-300">
										{CHAIN_LABEL[descriptor.chain] ?? descriptor.chain}
									</p>
								</div>
								<div>
									<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">target</p>
									<p className="mt-1 text-xs font-mono text-neutral-300">{descriptor.graduationTarget}</p>
								</div>
							</div>
						</div>

						<p id={descId} className="mt-4 text-sm text-neutral-300 leading-relaxed">
							{copy.modalIntro}
						</p>
						<p className="mt-2 text-xs text-neutral-500 leading-relaxed">{descriptor.comingSoonNotes}</p>

						<div className="mt-5 grid gap-2">
							{copy.creatorReasons.map((reason, index) => (
								<div
									key={reason}
									className="grid grid-cols-[2rem_1fr] items-start gap-3 border border-white/8 bg-white/[0.012] p-3"
								>
									<span className="font-mono text-[10px] text-accent/90">0{index + 1}</span>
									<p className="text-xs leading-relaxed text-neutral-300">{reason}</p>
								</div>
							))}
						</div>

						{joined ? (
							<output className="mt-6 block border border-accent/30 bg-accent/[0.04] p-4" aria-live="polite">
								<p className="text-sm text-white">
									{status.kind === "already" ? "you were already on this waitlist." : "you're on the waitlist."}
								</p>
								<p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">
									{status.email
										? t("wizard.launchpad.emailSaved", { email: status.email, platform: descriptor.displayName })
										: t("wizard.launchpad.emailFallback")}
								</p>
								<button
									type="button"
									onClick={onClose}
									className="mt-4 inline-flex h-9 items-center px-4 text-xs font-mono uppercase tracking-[0.2em] border border-white/15 text-neutral-200 transition-all duration-200 hover:border-white/30 hover:text-white active:translate-y-[1px]"
								>
									close
								</button>
							</output>
						) : (
							<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
								<label
									htmlFor={`${titleId}-email`}
									className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500"
								>
									email
								</label>
								<input
									id={`${titleId}-email`}
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder={t("wizard.launchpad.emailPlaceholder")}
									aria-describedby={helperId}
									aria-invalid={status.kind === "error"}
									className={cn(
										"h-12 bg-white/[0.015] border px-3 text-base text-white outline-none sm:text-sm",
										"transition-colors duration-200 placeholder:text-neutral-700",
										status.kind === "error"
											? "border-red-500/50 focus:border-red-500/80"
											: "border-white/10 focus:border-white/30",
									)}
								/>
								<p id={helperId} className="text-xs text-neutral-500 leading-relaxed">
									{copy.waitlistHelper}
								</p>
								{status.kind === "error" ? (
									<p className="text-xs text-red-400 font-mono" role="alert">
										{status.message}
									</p>
								) : null}
								<button
									type="submit"
									disabled={status.kind === "submitting"}
									className={cn(
										"mt-2 inline-flex h-12 items-center justify-center px-5 text-sm font-medium tracking-tight",
										"bg-accent text-black",
										"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
										"hover:bg-accent-dim active:translate-y-[1px]",
										"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
									)}
								>
									{status.kind === "submitting" ? t("wizard.launchpad.reservingSpot") : t("wizard.launchpad.joinWaitlist")}
								</button>
							</form>
						)}
					</motion.div>
				</motion.dialog>
			) : null}
		</AnimatePresence>
	);
}
