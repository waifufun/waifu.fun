"use client";

import { type AgentDetail, formatUsd } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

type Props = {
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

function Sparkline({ series }: { series: { ts: string; valueUsd: number }[] }) {
	if (!series || series.length < 2) {
		return <div className="h-16 w-full rounded bg-[#141414]" aria-hidden />;
	}
	const values = series.map((p) => p.valueUsd);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const width = 100;
	const height = 30;
	const step = width / (values.length - 1);
	const points = values
		.map((v, i) => {
			const x = i * step;
			const y = height - ((v - min) / range) * height;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className="w-full h-16"
			role="img"
			aria-label="Treasury value over time"
		>
			<polyline
				fill="none"
				stroke="#00ff87"
				strokeWidth="1.5"
				strokeLinejoin="round"
				strokeLinecap="round"
				points={points}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export default function TreasuryCard({ agent, isLoading }: Props) {
	const treasury = agent?.treasuryUsd ?? 0;
	const delta = agent?.treasuryDelta7d ?? 0;
	const runway = agent?.runwayDays ?? 0;
	const deltaPositive = delta >= 0;

	return (
		<section aria-label="treasury" className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]">
			<div className="flex items-start justify-between gap-4 mb-4">
				<div>
					<h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">treasury</h2>
					<div className="text-3xl font-medium text-white mt-1 tabular-nums">
						{isLoading ? "..." : formatUsd(treasury)}
					</div>
				</div>
				<div className="text-right">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">7d delta</div>
					<div
						className={cn("text-lg font-medium mt-1 tabular-nums", deltaPositive ? "text-[#00ff87]" : "text-red-400")}
					>
						{isLoading ? "..." : `${deltaPositive ? "+" : ""}${formatUsd(delta)}`}
					</div>
				</div>
			</div>

			<div className="mb-4">
				<Sparkline series={agent?.treasurySeries ?? []} />
			</div>

			<div className="grid grid-cols-2 gap-4 pt-4 border-t border-stroke">
				<div>
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">runway</div>
					<div className="text-white font-medium mt-1 tabular-nums">
						{isLoading ? "..." : Number.isFinite(runway) && runway > 0 ? `${Math.round(runway)}d` : "-"}
					</div>
				</div>
				<div>
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">daily burn</div>
					<div className="text-white font-medium mt-1 tabular-nums">
						{isLoading ? "..." : formatUsd(agent?.dailyBurnUsd ?? 0)}
					</div>
				</div>
			</div>

			<div className="mt-4 pt-4 border-t border-stroke">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 mb-2">tax stream</div>
				<p className="text-[11px] leading-relaxed text-neutral-400">
					3% buy + sell tax on graduated trades. TaxSplitter routes 65% here, 25% to the patron, 10% to the platform.
				</p>
			</div>
		</section>
	);
}
