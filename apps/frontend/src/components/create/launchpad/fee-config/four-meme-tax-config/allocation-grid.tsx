"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { FourMemeTaxFeeConfig } from "@/lib/launchpad/types";
import { cn } from "@/lib/utils";

const ALLOCATION_FIELDS = [
	{
		key: "founderBps" as const,
		label: "agent treasury",
		description: "operations, inference, patron rewards.",
	},
	{
		key: "holderBps" as const,
		label: "holder dividends",
		description: "auto-distributed pro-rata to holders above the min balance.",
	},
	{ key: "burnBps" as const, label: "burn", description: "burned every trade. supply deflates over time." },
	{ key: "liquidityBps" as const, label: "auto-LP", description: "added back to LP. depth compounds." },
];

type Props = {
	allocation: FourMemeTaxFeeConfig["allocation"];
	allocationSum: number;
	expectedSum: number;
	sumOff: boolean;
	onAllocationChange: (key: keyof FourMemeTaxFeeConfig["allocation"], pct: number) => void;
	onRescale: () => void;
};

export function AllocationGrid({
	allocation,
	allocationSum,
	expectedSum,
	sumOff,
	onAllocationChange,
	onRescale,
}: Props) {
	const { t } = useTranslation();
	return (
		<section>
			<header className="flex items-baseline justify-between mb-3">
				<div>
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						{t("wizard.launchpad.tax.allocation")}
					</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						{t("wizard.launchpad.tax.allocationHelp", { pct: (expectedSum / 100).toFixed(2) })}
					</p>
				</div>
				<span
					className={cn(
						"text-[10px] font-mono tabular-nums uppercase tracking-[0.2em]",
						sumOff ? "text-red-400" : "text-accent",
					)}
					aria-live="polite"
				>
					{(allocationSum / 100).toFixed(2)}% / {(expectedSum / 100).toFixed(2)}%
				</span>
			</header>

			<div className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
				{ALLOCATION_FIELDS.map((f) => {
					const bps = allocation[f.key];
					return (
						<div key={f.key} className="grid grid-cols-[1fr_120px] gap-4 p-4 items-center">
							<div className="min-w-0">
								<p className="text-sm text-white tracking-tight">{t(`wizard.launchpad.tax.${f.key}Label`)}</p>
								<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
									{t(`wizard.launchpad.tax.${f.key}Desc`)}
								</p>
							</div>
							<div
								className={cn(
									"flex items-center h-11 border bg-black/40 px-2",
									sumOff ? "border-red-500/40" : "border-white/10 focus-within:border-white/30",
								)}
							>
								<input
									type="number"
									min={0}
									max={100}
									step={0.5}
									value={bps / 100}
									onChange={(e) => onAllocationChange(f.key, Number(e.target.value))}
									aria-label={`${t(`wizard.launchpad.tax.${f.key}Label`)} percentage`}
									className="w-full bg-transparent outline-none text-sm font-mono tabular-nums text-white text-right"
								/>
								<span className="ml-1 text-neutral-500 font-mono text-sm">%</span>
							</div>
						</div>
					);
				})}
			</div>

			{/* Stacked bar visualization */}
			<div
				className="mt-3 relative h-2 w-full bg-white/5 overflow-hidden flex"
				role="img"
				aria-label={t("wizard.launchpad.tax.allocationBreakdown")}
			>
				{ALLOCATION_FIELDS.map((f, i) => {
					const bps = allocation[f.key];
					const pct = allocationSum > 0 ? (bps / allocationSum) * 100 : 0;
					const colors = ["bg-accent", "bg-white/40", "bg-white/25", "bg-white/15"];
					return <div key={f.key} className={cn("h-full", colors[i % colors.length])} style={{ width: `${pct}%` }} />;
				})}
			</div>

			{sumOff ? (
				<button
					type="button"
					onClick={onRescale}
					className="mt-3 inline-flex h-9 items-center px-3 text-[11px] font-mono uppercase tracking-[0.2em] border border-white/15 text-neutral-300 hover:border-white/30 hover:text-white transition-colors"
				>
					{t("wizard.launchpad.tax.rescale")}
				</button>
			) : null}
		</section>
	);
}
