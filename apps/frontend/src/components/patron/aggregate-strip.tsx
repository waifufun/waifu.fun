import { type PatronAgent, formatUsd } from "@/lib/api/patron";

type Metric = { label: string; value: string };

function computeMetrics(agents: PatronAgent[]): Metric[] {
	const totalTreasury = agents.reduce((acc, a) => acc + (a.treasuryUsd ?? 0), 0);
	const totalBurn = agents.reduce((acc, a) => acc + (a.dailyBurnUsd ?? 0), 0);
	const combinedRunway = totalBurn > 0 ? totalTreasury / totalBurn : 0;

	return [
		{ label: "agents", value: String(agents.length) },
		{ label: "total treasury", value: formatUsd(totalTreasury) },
		{ label: "daily burn", value: formatUsd(totalBurn) },
		{
			label: "combined runway",
			value: totalBurn > 0 ? `${Math.round(combinedRunway)}d` : "-",
		},
	];
}

export default function AggregateStrip({ agents }: { agents: PatronAgent[] }) {
	const metrics = computeMetrics(agents);
	return (
		<section
			aria-label="Aggregate stats"
			className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6 rounded-sm overflow-hidden bg-stroke-strong border border-stroke-strong"
		>
			{metrics.map((m) => (
				<div key={m.label} className="bg-[#0C0C0C] px-4 py-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{m.label}</div>
					<div className="text-lg font-medium text-white mt-1 tabular-nums">{m.value}</div>
				</div>
			))}
		</section>
	);
}
