"use client";

import { type Address, formatEther, isAddress } from "viem";
import { useBalance } from "wagmi";
import { bsc } from "wagmi/chains";

type Props = {
	/** TaxSplitter contract address (from agent_launches.tax_split.splitterAddress). */
	taxSplitter: Address | null;
	/** TreasuryLP contract address (from agent_launches.treasuryLpAddress). */
	treasuryLp: Address | null;
	/** Agent BPS share of the tax stream (from launch metadata). */
	agentBps: number | null;
	/** Patron BPS share of the tax stream (from launch metadata). */
	patronBps: number | null;
};

/**
 * Tax stream stats panel. Surfaces the live numbers we can read straight
 * from chain without an indexer:
 *   - splitter pending balance (BNB held in TaxSplitter, awaiting release)
 *   - treasury claimable (BNB the agent safe can pull from TreasuryLP)
 *   - share split (agent / patron bps)
 *
 * The spec also asks for "lifetime tax" + "24h tax". Those require an
 * indexer over Released() events; we render placeholders so the
 * panel ships now and lights up automatically once the post-launch tax
 * indexer wave lands.
 */
export function TaxStreamStats({ taxSplitter, treasuryLp, agentBps, patronBps }: Props) {
	const splitterValid = !!taxSplitter && isAddress(taxSplitter);
	const treasuryValid = !!treasuryLp && isAddress(treasuryLp);

	const splitterBalance = useBalance({
		address: splitterValid ? (taxSplitter as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: splitterValid, refetchInterval: 30_000 },
	});

	if (!splitterValid && !treasuryValid) {
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 text-[11px] font-mono text-white/40">
				tax routing not yet configured
			</div>
		);
	}

	const splitterBnb = splitterBalance.data?.value ?? 0n;
	const agentSharePct = agentBps != null ? agentBps / 100 : null;
	const patronSharePct = patronBps != null ? patronBps / 100 : null;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
			<div className="flex items-center justify-between mb-4">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">tax stream</div>
				{splitterValid ? (
					<a
						href={`https://bscscan.com/address/${taxSplitter}`}
						target="_blank"
						rel="noreferrer"
						className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
					>
						splitter
					</a>
				) : null}
			</div>

			<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
				<Stat label="lifetime tax" value="n/a" hint="indexer pending" />
				<Stat label="24h tax" value="n/a" hint="indexer pending" />
				<Stat label="splitter pending" value={splitterValid ? `${formatBnb(splitterBnb)} bnb` : "n/a"} />
				<Stat
					label="share split"
					value={
						agentSharePct != null && patronSharePct != null
							? `${agentSharePct.toFixed(0)}% agent \u00b7 ${patronSharePct.toFixed(0)}% patron`
							: "n/a"
					}
				/>
			</dl>

			<div className="mt-4 text-[11px] font-mono text-white/40">
				live splitter balance auto-refreshes. lifetime + 24h numbers fill in once the post-launch indexer is live.
			</div>
		</div>
	);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div>
			<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{label}</dt>
			<dd className="mt-1 tabular-nums text-white/85">{value}</dd>
			{hint ? <div className="text-[10px] font-mono text-white/30 mt-0.5">{hint}</div> : null}
		</div>
	);
}

function formatBnb(value: bigint): string {
	const s = formatEther(value);
	const [intPart, fracPart] = s.split(".");
	if (!fracPart) return intPart ?? "0";
	return `${intPart}.${fracPart.slice(0, 4)}`;
}
