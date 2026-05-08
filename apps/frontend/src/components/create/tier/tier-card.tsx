"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useId } from "react";
import { CheckIcon } from "../wizard-icons";
import { type TierPreset, totalBnb } from "./tier-data";

type Props = {
	tier: TierPreset;
	selected: boolean;
	onSelect: () => void;
};

function fmtBnb(n: number): string {
	return `${n} BNB`;
}

function fmtMcap(n: number): string {
	if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 2)}m`;
	return `${n}k`;
}

export function TierCard({ tier, selected, onSelect }: Props) {
	const headingId = useId();
	const recommended = tier.id === 90;
	const aggressive = tier.id === 98;

	return (
		<motion.button
			type="button"
			onClick={onSelect}
			aria-labelledby={headingId}
			aria-pressed={selected}
			data-testid={`tier-card-${tier.id}`}
			whileHover={{ y: -2 }}
			whileTap={{ y: 0, scale: 0.995 }}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
			className={cn(
				"group relative text-left flex flex-col gap-4 p-5 min-h-[260px] w-full overflow-hidden",
				"border bg-white/[0.012]",
				"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
				"focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
				selected ? "border-accent bg-accent/[0.04]" : "border-white/10 hover:border-white/25 hover:bg-white/[0.02]",
			)}
		>
			{/* top row: tier id + badge */}
			<div className="flex items-start justify-between gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">tier_{tier.id}</span>
				<div className="flex items-center gap-1.5 flex-wrap justify-end">
					{recommended ? (
						<span className="text-[9px] font-mono uppercase tracking-[0.24em] text-accent border border-accent/40 px-1.5 py-0.5">
							recommended
						</span>
					) : null}
					{aggressive ? (
						<span className="text-[9px] font-mono uppercase tracking-[0.24em] text-neutral-300 border border-white/20 px-1.5 py-0.5">
							degen
						</span>
					) : null}
					{selected ? <CheckIcon className="h-3.5 w-3.5 text-accent" /> : null}
				</div>
			</div>

			{/* title: open mc projection (the number people care about) */}
			<div className="flex-1 min-w-0">
				<h3 id={headingId} className="text-2xl text-white tracking-tight lowercase font-medium">
					{fmtMcap(tier.openMc)} open mc
				</h3>
				<p className="mt-1 text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">
					{tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1)}x presaler at open
				</p>
			</div>

			{/* stats grid */}
			<dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
				<div>
					<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">cap</dt>
					<dd className="mt-0.5 text-neutral-200">{fmtBnb(tier.cap)}</dd>
				</div>
				<div>
					<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">v2 buy</dt>
					<dd className="mt-0.5 text-neutral-200">{fmtBnb(tier.v2Buy)}</dd>
				</div>
				<div>
					<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">total bnb</dt>
					<dd className="mt-0.5 text-neutral-200">{fmtBnb(totalBnb(tier))}</dd>
				</div>
				<div>
					<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">burn</dt>
					<dd className="mt-0.5 text-neutral-200">{tier.burn}%</dd>
				</div>
				<div className="col-span-2">
					<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">vesting</dt>
					<dd className="mt-0.5 text-neutral-200">{tier.vesting}</dd>
				</div>
			</dl>
		</motion.button>
	);
}
