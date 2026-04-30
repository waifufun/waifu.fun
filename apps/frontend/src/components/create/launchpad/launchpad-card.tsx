"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { LaunchpadDescriptor } from "@/lib/launchpad/types";
import { CheckIcon } from "../wizard-icons";
import { LockIcon } from "./launchpad-icons";

type Props = {
	descriptor: LaunchpadDescriptor;
	selected: boolean;
	onSelect: () => void;
};

const CHAIN_LABEL: Record<string, string> = {
	bsc: "BSC",
	solana: "Solana",
	base: "Base",
	ethereum: "Ethereum",
};

export function LaunchpadCard({ descriptor, selected, onSelect }: Props) {
	const headingId = useId();
	const isComingSoon = descriptor.status === "coming-soon";
	const recommended = descriptor.badges?.includes("recommended");
	const advanced = descriptor.badges?.includes("advanced");

	return (
		<motion.button
			type="button"
			onClick={onSelect}
			aria-labelledby={headingId}
			aria-pressed={selected}
			data-testid={`launchpad-card-${descriptor.id}`}
			data-status={descriptor.status}
			whileHover={{ y: -2 }}
			whileTap={{ y: 0, scale: 0.995 }}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
			className={cn(
				"group relative text-left flex flex-col gap-4 p-5 min-h-[220px] w-full",
				"border bg-white/[0.012]",
				"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
				"focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
				selected ? "border-accent bg-accent/[0.04]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.02]",
				isComingSoon && "opacity-55 hover:opacity-75",
			)}
		>
			{/* top row: chain + badges */}
			<div className="flex items-start justify-between gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">
					{CHAIN_LABEL[descriptor.chain] ?? descriptor.chain}
				</span>
				<div className="flex items-center gap-1.5 flex-wrap justify-end">
					{recommended ? (
						<span className="text-[9px] font-mono uppercase tracking-[0.24em] text-accent border border-accent/40 px-1.5 py-0.5">
							recommended
						</span>
					) : null}
					{advanced ? (
						<span className="text-[9px] font-mono uppercase tracking-[0.24em] text-neutral-300 border border-white/20 px-1.5 py-0.5">
							advanced
						</span>
					) : null}
					{isComingSoon ? (
						<span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.24em] text-neutral-400 border border-white/15 px-1.5 py-0.5">
							<LockIcon className="h-2.5 w-2.5" />
							coming soon
						</span>
					) : null}
				</div>
			</div>

			{/* title */}
			<div className="flex-1 min-w-0">
				<h3 id={headingId} className="text-base text-white tracking-tight lowercase">
					{descriptor.displayName}
				</h3>
				<p className="mt-2 text-xs text-neutral-400 leading-relaxed">{descriptor.shortDescription}</p>
			</div>

			{/* fee + grad summary */}
			<dl className="border-t border-white/5 pt-3 grid grid-cols-1 gap-1.5">
				<div className="flex items-baseline justify-between gap-2">
					<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">fee</dt>
					<dd className="text-[11px] font-mono text-neutral-300 truncate text-right">{descriptor.feeSummary}</dd>
				</div>
				<div className="flex items-baseline justify-between gap-2">
					<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">graduates</dt>
					<dd className="text-[11px] font-mono text-neutral-300 truncate text-right">{descriptor.graduationTarget}</dd>
				</div>
				{descriptor.expectedAvailability ? (
					<div className="flex items-baseline justify-between gap-2">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">eta</dt>
						<dd className="text-[11px] font-mono text-neutral-400 truncate text-right">
							{descriptor.expectedAvailability}
						</dd>
					</div>
				) : null}
			</dl>

			{/* select affordance */}
			<div
				className={cn(
					"absolute right-3 bottom-3 inline-flex items-center gap-1.5",
					"text-[10px] font-mono uppercase tracking-[0.2em] transition-opacity duration-200",
					selected ? "text-accent opacity-100" : "text-neutral-500 opacity-0 group-hover:opacity-100",
				)}
				aria-hidden="true"
			>
				{selected ? (
					<>
						<CheckIcon className="h-3 w-3" />
						selected
					</>
				) : isComingSoon ? (
					"join waitlist"
				) : (
					"select"
				)}
			</div>
		</motion.button>
	);
}
