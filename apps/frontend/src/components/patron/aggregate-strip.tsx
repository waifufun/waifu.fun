"use client";

import { useTranslation } from "@/contexts/locale-context";
import { type PatronAgent, formatUsd } from "@/lib/api/patron";

type Metric = { key: string; label: string; value: string };

export default function AggregateStrip({ agents }: { agents: PatronAgent[] }) {
	const { t } = useTranslation();
	const totalTreasury = agents.reduce((acc, a) => acc + (a.treasuryUsd ?? 0), 0);
	const totalBurn = agents.reduce((acc, a) => acc + (a.dailyBurnUsd ?? 0), 0);
	const combinedRunway = totalBurn > 0 ? totalTreasury / totalBurn : 0;

	const metrics: Metric[] = [
		{ key: "agents", label: t("patron.aggregate.agents"), value: String(agents.length) },
		{ key: "totalTreasury", label: t("patron.aggregate.totalTreasury"), value: formatUsd(totalTreasury) },
		{ key: "dailyBurn", label: t("patron.aggregate.dailyBurn"), value: formatUsd(totalBurn) },
		{
			key: "combinedRunway",
			label: t("patron.aggregate.combinedRunway"),
			value: totalBurn > 0 ? `${Math.round(combinedRunway)}d` : "-",
		},
	];

	return (
		<section
			aria-label={t("patron.aggregate.ariaLabel")}
			className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6 rounded-sm overflow-hidden bg-stroke-strong border border-stroke-strong"
		>
			{metrics.map((m) => (
				<div key={m.key} className="bg-[#0C0C0C] px-4 py-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{m.label}</div>
					<div className="text-lg font-medium text-white mt-1 tabular-nums">{m.value}</div>
				</div>
			))}
		</section>
	);
}
