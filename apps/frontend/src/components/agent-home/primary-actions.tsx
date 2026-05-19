/**
 * PrimaryActions. A slim row of quick-access affordances surfaced
 * directly under the hero so the user lands on the page and immediately
 * sees how to act on the agent, without scrolling past every stat panel
 * first.
 *
 * Actions:
 *   - trade on PancakeSwap (when a pancake pair exists)
 *   - jump to the in-page swap section (always)
 *   - share (copy page url to clipboard)
 *   - view on bscscan (always)
 *
 * Style discipline: variance 6 / motion 4 / density 4.
 * Buttons are quiet by default; the primary CTA (trade) is the only one
 * that picks up the accent. No filled blocks, no gradient.
 */
"use client";

import { ArrowDownUp, Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

import type { AgentData } from "./types";

export interface PrimaryActionsProps {
	agent: AgentData;
}

export default function PrimaryActions({ agent }: PrimaryActionsProps) {
	const pancakeUrl =
		agent.pancakeSwapUrl ?? `https://pancakeswap.finance/swap?outputCurrency=${agent.tokenAddress}&chain=bsc`;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<a
				href={pancakeUrl}
				target="_blank"
				rel="noreferrer"
				className="group inline-flex h-10 items-center gap-2 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/[0.06] px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] transition-colors duration-200 hover:border-[#00ff87]/60 hover:bg-[#00ff87]/[0.1]"
			>
				trade on pcs
				<ExternalLink
					className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
					strokeWidth={1.75}
				/>
			</a>

			<a
				href="#trade"
				className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-200 hover:border-white/30 hover:text-white/95"
			>
				<ArrowDownUp className="h-3 w-3" strokeWidth={1.5} />
				swap here
			</a>

			<ShareButton tokenAddress={agent.tokenAddress} />

			<a
				href={`https://bscscan.com/address/${agent.tokenAddress}`}
				target="_blank"
				rel="noreferrer"
				className="ml-auto inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors duration-200 hover:border-white/30 hover:text-white/85"
			>
				bscscan
				<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
			</a>
		</div>
	);
}

function ShareButton({ tokenAddress }: { tokenAddress: string }) {
	const [copied, setCopied] = useState(false);

	const onShare = useCallback(() => {
		const url = typeof window !== "undefined" ? `${window.location.origin}/agent/${tokenAddress}` : "";
		void (async () => {
			try {
				await navigator.clipboard.writeText(url);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			} catch (err) {
				console.error("share copy failed", err);
			}
		})();
	}, [tokenAddress]);

	return (
		<button
			type="button"
			onClick={onShare}
			className={cn(
				"inline-flex h-10 items-center gap-2 rounded-sm border px-4 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors duration-200",
				copied
					? "border-[#00ff87]/40 text-[#00ff87]"
					: "border-white/15 text-white/55 hover:border-white/30 hover:text-white/85",
			)}
		>
			{copied ? <Check className="h-3 w-3" strokeWidth={1.75} /> : <Copy className="h-3 w-3" strokeWidth={1.5} />}
			{copied ? "link copied" : "share"}
		</button>
	);
}
