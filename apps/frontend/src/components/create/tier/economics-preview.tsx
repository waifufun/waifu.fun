"use client";

import { cn } from "@/lib/utils";
import { type TierPreset, totalBnb } from "./tier-data";

type Props = {
	tier: TierPreset | null;
};

function fmtBnb(n: number, digits = 0): string {
	return `${n.toFixed(digits)} BNB`;
}

function fmtMcap(n: number): string {
	if (n >= 1_000) {
		const m = n / 1_000;
		return `$${m.toFixed(m >= 10 ? 0 : 2)}M`;
	}
	return `$${n}k`;
}

/**
 * Live preview of the economics implied by the selected tier.
 * Mirrors the math in treasury-lp-viz.shadowverse.workers.dev:
 *   - presale clears at `cap` BNB
 *   - platform contributes `v2Buy` BNB at v2 graduation
 *   - resulting open mc is `openMc` (k notation)
 *   - a presaler clearing the cap unlocks a `presaler`x at open
 *   - `burn`% of the LP / supply is burned at graduation
 *   - vesting controls the remaining unlock cadence
 */
export function EconomicsPreview({ tier }: Props) {
	if (!tier) {
		return (
			<div
				className={cn(
					"border border-white/8 bg-white/[0.012] p-5",
					"text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-600",
				)}
			>
				pick a tier above to see projected economics.
			</div>
		);
	}

	const presaleShare = tier.cap / totalBnb(tier);
	const platformShare = tier.v2Buy / totalBnb(tier);

	return (
		<div className="border border-accent/30 bg-accent/[0.02] p-5">
			<div className="flex items-baseline justify-between gap-3 mb-4">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-accent">{`economics • tier_${tier.id}`}</p>
				<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">live preview</p>
			</div>

			{/* big numbers row */}
			<div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
				<Metric label="open mc" value={fmtMcap(tier.openMc)} accent />
				<Metric label="presaler" value={`${tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1)}x`} />
				<Metric label="total bnb" value={fmtBnb(totalBnb(tier))} />
			</div>

			{/* breakdown bar */}
			<div className="mb-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
				<span>presale {fmtBnb(tier.cap)}</span>
				<span>v2 buy {fmtBnb(tier.v2Buy)}</span>
			</div>
			<div className="relative h-1.5 w-full bg-white/5 overflow-hidden mb-5">
				<div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${presaleShare * 100}%` }} />
				<div
					className="absolute inset-y-0 bg-accent/40"
					style={{ left: `${presaleShare * 100}%`, width: `${platformShare * 100}%` }}
				/>
			</div>

			<dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
				<Row label="cap" value={fmtBnb(tier.cap)} />
				<Row label="v2 buy" value={fmtBnb(tier.v2Buy)} />
				<Row label="burn" value={`${tier.burn}%`} />
				<Row label="vesting" value={tier.vesting} />
			</dl>

			<p className="mt-5 text-[11px] text-neutral-400 leading-relaxed">
				presalers who clear the cap exit at roughly{" "}
				<span className="text-accent">{tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1)}x</span> when v2 opens.{" "}
				{tier.vesting === "none" ? "no vesting, all unlocked at open." : "the rest unlocks 50% at open, 50% over 24h."}{" "}
				{tier.burn}% of supply burns at graduation.
			</p>
		</div>
	);
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
	return (
		<div>
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">{label}</p>
			<p className={cn("mt-1 text-xl tracking-tight tabular-nums lowercase", accent ? "text-accent" : "text-white")}>
				{value}
			</p>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">{label}</dt>
			<dd className="text-neutral-200 tabular-nums">{value}</dd>
		</div>
	);
}
