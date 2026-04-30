"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useState } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { postWaitlistSignup } from "@/hooks/use-launchpads";
import type { LaunchpadDescriptor } from "@/lib/launchpad/types";
import { CloseIcon } from "./launchpad-icons";

type Props = {
	descriptor: LaunchpadDescriptor | null;
	open: boolean;
	onClose: () => void;
};

type Status =
	| { kind: "idle" }
	| { kind: "submitting" }
	| { kind: "success"; stub: boolean }
	| { kind: "error"; message: string };

export function LaunchpadComingSoonModal({ descriptor, open, onClose }: Props) {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const titleId = useId();
	const descId = useId();

	useEffect(() => {
		if (!open) {
			// reset after close animation
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
				setStatus({ kind: "success", stub: result.stub });
			} else {
				setStatus({ kind: "error", message: result.error });
			}
		},
		[descriptor, email, status.kind],
	);

	return (
		<AnimatePresence>
			{open && descriptor ? (
				<motion.div
					key="overlay"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
					className="fixed inset-0 z-50 flex items-center justify-center px-4"
					aria-modal="true"
					role="dialog"
					aria-labelledby={titleId}
					aria-describedby={descId}
				>
					{/* backdrop */}
					<button
						type="button"
						aria-label="close waitlist dialog"
						onClick={onClose}
						className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
					/>

					<motion.div
						key="dialog"
						initial={{ opacity: 0, y: 16, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 8, scale: 0.98 }}
						transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
						className="relative w-full max-w-[440px] border border-white/10 bg-[#0a0a0c] p-6"
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">waitlist</p>
								<h2 id={titleId} className="mt-2 text-xl text-white tracking-tight lowercase">
									{descriptor.displayName}
								</h2>
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label="close"
								className="text-neutral-500 hover:text-white transition-colors"
							>
								<CloseIcon className="h-4 w-4" />
							</button>
						</div>

						<p id={descId} className="mt-4 text-sm text-neutral-400 leading-relaxed">
							{descriptor.comingSoonNotes ?? "we'll email you the moment this launchpad goes live."}
							{descriptor.expectedAvailability ? (
								<>
									{" "}
									<span className="text-neutral-300">eta:</span>{" "}
									<span className="font-mono text-neutral-300">{descriptor.expectedAvailability}</span>
									{"."}
								</>
							) : null}
						</p>

						{status.kind === "success" ? (
							<div className="mt-6 border border-accent/30 bg-accent/[0.04] p-4">
								<p className="text-sm text-white">you're on the list.</p>
								<p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">
									{status.stub
										? "(backend wiring coming soon. saved locally for now.)"
										: "we'll email you when it ships."}
								</p>
								<button
									type="button"
									onClick={onClose}
									className="mt-4 inline-flex h-9 items-center px-4 text-xs font-mono uppercase tracking-[0.2em] border border-white/15 text-neutral-200 hover:border-white/30 hover:text-white transition-colors"
								>
									close
								</button>
							</div>
						) : (
							<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
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
									placeholder="you@example.com"
									className={cn(
										"h-11 bg-white/[0.015] border px-3 text-sm text-white outline-none",
										"transition-colors duration-200",
										status.kind === "error"
											? "border-red-500/40 focus:border-red-500/70"
											: "border-white/10 focus:border-white/30",
									)}
								/>
								{status.kind === "error" ? (
									<p className="text-xs text-red-400 font-mono" role="alert">
										{status.message}
									</p>
								) : null}
								<button
									type="submit"
									disabled={status.kind === "submitting"}
									className={cn(
										"mt-2 inline-flex h-11 items-center justify-center px-5 text-sm font-medium tracking-tight",
										"bg-accent text-black",
										"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
										"hover:bg-accent-dim active:translate-y-[1px]",
										"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
									)}
								>
									{status.kind === "submitting" ? "sending..." : "join waitlist"}
								</button>
							</form>
						)}
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
