import { fetchAgentStats, fetchRecentTrades } from "@/lib/agents-api";
import ActivityMarquee from "./activity-marquee";
import ActivityStripStats from "./activity-strip-stats";

function formatBnb(v: number) {
	if (!v) return "0";
	if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
	if (v >= 1) return v.toFixed(2);
	return v.toFixed(3);
}

function formatUsd(v: number) {
	if (!v) return "$0";
	if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`;
	if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
	return `$${v.toFixed(0)}`;
}

export default async function ActivityStrip() {
	const [stats, trades] = await Promise.all([fetchAgentStats(), fetchRecentTrades(8)]);

	return (
		<section className="border-y border-white/10 bg-[#050506]">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 py-5">
				{/* stats row (client component to consume t()) */}
				<ActivityStripStats
					totalAgents={stats.totalAgents}
					totalVolumeDisplay={stats.totalVolume > 0 ? formatUsd(stats.totalVolume) : "–"}
					graduatedCount={stats.graduatedCount}
				/>

				{/* live trades marquee */}
				{trades.length > 0 && (
					<div className="mt-4 pt-4 border-t border-white/[0.06]">
						<ActivityMarquee
							trades={trades.slice(0, 6).map((t) => ({
								agentTicker: t.agentTicker,
								agentName: t.agentName,
								type: t.type,
								amount: formatBnb(Number(t.amount) || 0),
								timestamp: t.timestamp,
							}))}
						/>
					</div>
				)}
			</div>
		</section>
	);
}
