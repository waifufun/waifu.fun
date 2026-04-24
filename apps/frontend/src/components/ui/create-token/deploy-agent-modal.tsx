"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Rocket, X } from "lucide-react";
import Link from "next/link";

/**
 * Compat shell for the legacy "deploy a fleek agent onto an existing token" modal.
 *
 * The four.meme pivot moved agent deployment to a dedicated /create wizard where
 * the agent *is* the creator of the token. This modal now redirects there and
 * exists purely so older call sites (agent-panel, profile/agents-tab) keep
 * compiling until they're updated.
 *
 * TODO(cleanup): remove along with agent-panel + agents-tab once token-page and
 * profile-page are refactored for the agent runtime.
 */
type DeployAgentModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// legacy props, accepted for back-compat, unused
	tokenAddress?: string | `0x${string}` | undefined;
	tokenName?: string | undefined;
	tokenDescription?: string | undefined;
	onDeployed?: (() => void) | undefined;
	prefill?: unknown;
};

export function DeployAgentModal({ open, onOpenChange }: DeployAgentModalProps) {
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
					onClick={() => onOpenChange(false)}
				>
					<motion.div
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.95, opacity: 0 }}
						onClick={(e) => e.stopPropagation()}
						className="relative w-full max-w-md border border-white/10 bg-[#08080a] rounded-sm p-6"
					>
						<button
							type="button"
							className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
							onClick={() => onOpenChange(false)}
							aria-label="close"
						>
							<X className="w-4 h-4" />
						</button>

						<div className="mb-5 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/5">
								<Rocket className="h-5 w-5 text-[#00ff87]" />
							</div>
							<div>
								<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
									waifu.fun / agent runtime
								</div>
								<div className="text-lg tracking-tight text-white">deploy an agent</div>
							</div>
						</div>

						<p className="text-sm text-white/60 leading-relaxed">
							agent deployment is now a single flow. identity, brain, wallet, treasury, token — one wizard, three steps.
						</p>

						<div className="mt-6 flex items-center gap-3">
							<Link
								href="/agents"
								className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-black bg-[#00ff87] rounded-sm hover:bg-[#00ff87]/90 transition-colors"
								onClick={() => onOpenChange(false)}
							>
								open create wizard
								<Rocket className="w-3.5 h-3.5" />
							</Link>
							<button
								type="button"
								className="px-4 py-2 text-sm text-white/60 hover:text-white/90 transition-colors"
								onClick={() => onOpenChange(false)}
							>
								not now
							</button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
