import { formatUsd, type PatronAgent } from "@/lib/api/patron";

type Metric = { label: string; value: string };

function computeMetrics(agents: PatronAgent[]): Metric[] {
	const totalTreasury = agents.reduce((acc, a) => acc + (a.treasuryUsd ?? 0), 0);
	const totalBurn = agents.reduce((acc, a) => acc + (a.dailyBurnUsd ?? 0), 0);
	const combinedRunway = totalBurn > 0 ? totalTreasury / totalBurn : 0;

	return [
		{ label: "Agents", value: String(agents.length) },
		{ label: "Total treasury", value: formatUsd(totalTreasury) },
		{ label: "Daily burn", value: formatUsd(totalBurn) },
		{
			label: "Combined runway",
			value: totalBurn > 0 ? `${Math.round(combinedRunway)}d` : "-",
		},
	];
}

export default function AggregateStrip({ agents }: { agents: PatronAgent[] }) {
	const metrics = computeMetrics(agents);
	return (
		<section
			aria-label="Aggregate stats"
			className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6 rounded-md overflow-hidden bg-autofun-background-action-highlight/40 border border-autofun-background-action-highlight/40"
		>
			{metrics.map((m) => (
				<div key={m.label} className="bg-[#0C0C0C] px-4 py-3">
					<div className="text-xs uppercase tracking-wide text-neutral-500">{m.label}</div>
					<div className="text-lg font-medium text-white mt-1">{m.value}</div>
				</div>
			))}
		</section>
	);
}
