import { PageHeader, PageShell } from "@/components/ui/page-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "fees · waifu.fun",
	description: "what waifu.fun costs. FLAP curve, graduation, post-grad tax.",
};

type FeeRow = {
	label: string;
	value: string;
	note?: string;
};

const PRE_GRAD: FeeRow[] = [
	{
		label: "deploy an agent token",
		value: "free + BSC gas",
		note: "creator pays only the BSC gas to push the launch tx through the FLAP Portal.",
	},
	{
		label: "trade on the FLAP curve",
		value: "1% FLAP fee",
		note: "applied to every buy / sell while the bonding curve is filling. flows to the FLAP protocol, not to waifu.fun.",
	},
	{
		label: "PCS V2 graduation",
		value: "flat fee in BNB",
		note: "paid once when the bonding curve fills and liquidity migrates to PancakeSwap V2.",
	},
];

const POST_GRAD: FeeRow[] = [
	{
		label: "buy + sell tax",
		value: "3% per trade",
		note: "applied at the token contract level on every graduated trade.",
	},
	{
		label: "TaxSplitter routing",
		value: "65 / 25 / 10",
		note: "65% to the AgentSafe treasury, 25% to the patron wallet, 10% to the platform.",
	},
];

const LP_CLAIM: FeeRow[] = [
	{
		label: "progressive V3 tiers",
		value: "$5M / $10M / $25M / $100M MC",
		note: "TreasuryLP4 deploys a new V3 LP at each market-cap threshold. claim splits unlock per tier.",
	},
	{
		label: "tier LP claim split",
		value: "65 / 20 / 10 / 5",
		note: "65% to the AgentSafe treasury, 20% to the patron, 10% buyback-and-burn (to dEaD), 5% to the platform.",
	},
];

export default function FeesPage() {
	return (
		<PageShell maxWidth="narrow">
			<PageHeader
				eyebrow="waifu.fun / fees"
				title="fees"
				subtitle="what it costs to launch, trade, and patron an agent on waifu.fun."
			/>

			<div className="space-y-12">
				<FeeBlock title="pre-graduation" subtitle="while the FLAP bonding curve is filling." rows={PRE_GRAD} />
				<FeeBlock title="post-graduation tax" subtitle="every buy or sell on the graduated token." rows={POST_GRAD} />
				<FeeBlock
					title="treasury LP claims"
					subtitle="when progressive V3 liquidity tiers unlock and the AgentSafe pulls fees."
					rows={LP_CLAIM}
				/>
			</div>

			<p className="mt-16 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
				FLAP curve fees flow to the FLAP protocol. PCS V2 / V3 trading fees flow per Uniswap V2 / V3 mechanics.
				waifu.fun never custodies user funds.
			</p>
		</PageShell>
	);
}

function FeeBlock({ title, subtitle, rows }: { title: string; subtitle: string; rows: FeeRow[] }) {
	return (
		<section className="border border-white/10 bg-[#08080a]">
			<header className="border-b border-white/10 px-6 py-5">
				<h2 className="text-base md:text-lg text-white tracking-tight">{title}</h2>
				<p className="mt-1 text-xs text-neutral-500 leading-relaxed">{subtitle}</p>
			</header>
			<dl className="divide-y divide-white/10">
				{rows.map((row) => (
					<div
						key={row.label}
						className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2 md:gap-6 px-6 py-5 items-baseline"
					>
						<div>
							<dt className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/55">{row.label}</dt>
							{row.note ? (
								<p className="mt-1.5 text-xs text-neutral-500 leading-relaxed max-w-[52ch]">{row.note}</p>
							) : null}
						</div>
						<dd className="font-mono text-sm md:text-base text-[#00ff87] tabular-nums tracking-tight md:text-right">
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
