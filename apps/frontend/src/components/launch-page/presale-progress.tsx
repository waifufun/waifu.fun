"use client";

import { formatEther } from "viem";

import { cn } from "@/lib/utils";

type Props = {
	totalDeposited: bigint;
	capWei: bigint;
	bonusPool?: bigint | null;
	className?: string;
};

/**
 * Presale fill progress bar. Visualizes `totalDeposited / cap` and overlays
 * the bonus pool (forfeited withdraw penalty bnb) on top if non-zero.
 *
 * Re-renders implicitly when the parent re-fetches via `use-launch-vault`.
 */
export function PresaleProgress({ totalDeposited, capWei, bonusPool, className }: Props) {
	const cap = capWei > 0n ? capWei : 0n;
	const filledPct = cap === 0n ? 0 : clampPct(Number((totalDeposited * 10_000n) / cap) / 100);
	const bonus = bonusPool ?? 0n;
	const bonusPct = cap === 0n || bonus <= 0n ? 0 : clampPct(Number((bonus * 10_000n) / cap) / 100);

	return (
		<div className={cn("flex flex-col gap-2", className)} aria-label="presale progress">
			<div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
				<span>
					{formatBnb(totalDeposited)} / {formatBnb(cap)} bnb
				</span>
				<span className="tabular-nums" data-testid="presale-progress-pct">
					{filledPct.toFixed(1)}%
				</span>
			</div>
			<div
				className="relative h-2 w-full overflow-hidden border border-white/10 bg-[#111114]"
				role="progressbar"
				tabIndex={0}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(filledPct)}
				aria-label={`${filledPct.toFixed(1)}% of presale cap filled`}
			>
				<div
					className="absolute inset-y-0 left-0 bg-[#00ff87] transition-[width] duration-500"
					style={{ width: `${filledPct}%` }}
				/>
				{bonusPct > 0 ? (
					<div
						className="absolute inset-y-0 right-0 bg-[#ffb347]/70"
						style={{ width: `${bonusPct}%` }}
						title={`bonus pool: ${formatBnb(bonus)} bnb`}
					/>
				) : null}
			</div>
			{bonus > 0n ? (
				<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#ffb347]/80">
					<span className="inline-block w-2 h-2 bg-[#ffb347]/70" aria-hidden />
					bonus pool: {formatBnb(bonus)} bnb (added to bundle)
				</div>
			) : null}
		</div>
	);
}

function clampPct(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(100, Math.max(0, n));
}

function formatBnb(value: bigint): string {
	const ether = formatEther(value);
	const num = Number(ether);
	if (!Number.isFinite(num)) return ether;
	if (num === 0) return "0";
	if (num >= 100) return num.toFixed(1);
	if (num >= 1) return num.toFixed(2);
	return num.toFixed(4);
}
