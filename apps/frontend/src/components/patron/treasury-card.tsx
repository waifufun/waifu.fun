"use client";

import { formatUsd, type AgentDetail } from "@/lib/api/patron";
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
		<section
			aria-label="Treasury"
			className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]"
		>
			<div className="flex items-start justify-between gap-4 mb-4">
				<div>
					<h2 className="text-xs uppercase tracking-wide text-neutral-500">Treasury</h2>
					<div className="text-3xl font-medium text-white mt-1">{isLoading ? "..." : formatUsd(treasury)}</div>
				</div>
				<div className="text-right">
					<div className="text-xs uppercase tracking-wide text-neutral-500">7d delta</div>
					<div className={cn("text-lg font-medium mt-1", deltaPositive ? "text-[#00ff87]" : "text-red-400")}>
						{isLoading ? "..." : `${deltaPositive ? "+" : ""}${formatUsd(delta)}`}
					</div>
				</div>
			</div>

			<div className="mb-4">
				<Sparkline series={agent?.treasurySeries ?? []} />
			</div>

			<div className="grid grid-cols-2 gap-4 pt-4 border-t border-stroke">
				<div>
					<div className="text-xs uppercase tracking-wide text-neutral-500">Runway</div>
					<div className="text-white font-medium mt-1">
						{isLoading ? "..." : Number.isFinite(runway) && runway > 0 ? `${Math.round(runway)}d` : "-"}
					</div>
				</div>
				<div>
					<div className="text-xs uppercase tracking-wide text-neutral-500">Daily burn</div>
					<div className="text-white font-medium mt-1">{isLoading ? "..." : formatUsd(agent?.dailyBurnUsd ?? 0)}</div>
				</div>
			</div>
		</section>
	);
}
