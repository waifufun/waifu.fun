import { fetchAgentStats, fetchRecentTrades } from "@/lib/agents-api";
import ActivityMarquee from "./activity-marquee";

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

// Pluralize a noun against a count: 1 → singular, anything else → plural.
// Keeps the launch-day stat row readable ("1 agent launched" not
// "1 agents launched"). lowercase TPOT voice is preserved by the consumer.
function pluralize(count: number, singular: string, plural: string): string {
	return count === 1 ? singular : plural;
}

export default async function ActivityStrip() {
	const [stats, trades] = await Promise.all([fetchAgentStats(), fetchRecentTrades(8)]);

	return (
		<section className="border-y border-white/10 bg-[#050506]">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 py-5">
				{/* stats row */}
				<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-mono uppercase tracking-[0.18em]">
					<Stat
						value={stats.totalAgents.toLocaleString()}
						label={pluralize(stats.totalAgents, "agent launched", "agents launched")}
					/>
					<Divider />
					<Stat value={stats.totalVolume > 0 ? formatUsd(stats.totalVolume) : "·"} label="total volume" />
					<Divider />
					<Stat value={stats.graduatedCount.toLocaleString()} label="on pancakeswap" />
				</div>

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

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="text-white/85 tracking-wider">{value}</span>
			<span className="text-white/35">{label}</span>
		</div>
	);
}

function Divider() {
	return <span className="text-white/15 hidden sm:inline">/</span>;
}
