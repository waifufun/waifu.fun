/**
 * Top-of-page portfolio overview strip.
 *
 * Five stats that summarize a patron's exposure across every launch
 * they've backed. Mirrors the visual language of the existing patron
 * `AggregateStrip` so the two pages feel like siblings.
 */
import type { PortfolioTotals } from "@/lib/portfolio/aggregate";
import { formatBnb, formatBnbDelta, formatTokens } from "@/lib/portfolio/format";

type Props = {
	totals: PortfolioTotals;
};

export default function PortfolioStats({ totals }: Props) {
	// Total exposure: the cost basis the patron put in vs the implied
	// current value (realized + unrealized). pnl is the delta.
	const currentValueWei = totals.realizedWei + totals.unrealizedWei;
	const pnlWei = currentValueWei - totals.investedWei;
	const pnlPositive = pnlWei >= 0n;

	const metrics: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }[] = [
		{
			label: "backed",
			value: String(totals.count),
		},
		{
			label: "invested",
			value: `${formatBnb(totals.investedWei)} bnb`,
		},
		{
			label: "realized",
			value: `${formatBnb(totals.realizedWei)} bnb`,
		},
		{
			label: "unrealized",
			value: `${formatBnb(totals.unrealizedWei)} bnb`,
		},
		{
			label: "p&l",
			value: `${formatBnbDelta(pnlWei)} bnb`,
			tone: pnlWei === 0n ? "neutral" : pnlPositive ? "positive" : "negative",
		},
		{
			label: "claimable",
			value: `${formatTokens(totals.claimableTokens)} tokens`,
			tone: totals.claimableTokens > 0n ? "positive" : "neutral",
		},
	];

	return (
		<section
			aria-label="portfolio overview"
			className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px mb-6 rounded-sm overflow-hidden bg-stroke-strong border border-stroke-strong"
		>
			{metrics.map((m) => (
				<div key={m.label} className="bg-[#0C0C0C] px-4 py-3">
					<div className="text-[10px] uppercase tracking-[0.2em] font-mono text-neutral-500">{m.label}</div>
					<div
						className={`text-lg font-medium mt-1 tabular-nums ${
							m.tone === "positive" ? "text-[#00ff87]" : m.tone === "negative" ? "text-red-400" : "text-white"
						}`}
					>
						{m.value}
					</div>
				</div>
			))}
		</section>
	);
}
