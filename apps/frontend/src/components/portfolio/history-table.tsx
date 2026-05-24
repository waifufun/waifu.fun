/**
 * Past launches with realized p&l.
 *
 * Realized BNB value is computed at the launch's opening market cap,
 * which is what was actually banked at v2 listing. If we don't have an
 * openMcBnb yet, we hide the p&l column for that row and just show
 * "–". Failed launches show the deposit as a loss (the vault refunds
 * net of penalty when in OPEN; failures past CLOSED return nothing).
 */
"use client";

import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/contexts/locale-context";
import type { UserLaunchEntry } from "@/lib/api/portfolio";
import { formatBnb, formatBnbDelta, impliedBnbValue } from "@/lib/portfolio/format";

type Props = {
	entries: UserLaunchEntry[];
};

function deriveRealized(entry: UserLaunchEntry): {
	investedWei: bigint;
	realizedWei: bigint | null;
	pnlWei: bigint | null;
} {
	let investedWei = 0n;
	try {
		investedWei = BigInt(entry.position.deposited || "0");
	} catch {
		/* skip */
	}

	if (entry.launch.state === "failed") {
		return { investedWei, realizedWei: 0n, pnlWei: -investedWei };
	}

	if (entry.launch.state !== "launched" || !entry.launch.openMcBnb) {
		return { investedWei, realizedWei: null, pnlWei: null };
	}

	// total realized = (claimed + remaining alloc) * priceBnb
	let claimedValue = 0n;
	let remainingValue = 0n;
	const claimedTokens = entry.position.claimed;
	const claimedAtMc = impliedBnbValue(claimedTokens, entry.launch.openMcBnb);
	if (claimedAtMc) claimedValue = claimedAtMc;

	if (entry.position.totalAllocation) {
		try {
			const alloc = BigInt(entry.position.totalAllocation);
			const claimed = BigInt(claimedTokens || "0");
			const remaining = alloc > claimed ? alloc - claimed : 0n;
			const remainingAtMc = impliedBnbValue(remaining.toString(), entry.launch.openMcBnb);
			if (remainingAtMc) remainingValue = remainingAtMc;
		} catch {
			/* skip */
		}
	}

	const realizedWei = claimedValue + remainingValue;
	const pnlWei = realizedWei - investedWei;
	return { investedWei, realizedWei, pnlWei };
}

export default function HistoryTable({ entries }: Props) {
	const { t } = useTranslation();
	if (entries.length === 0) {
		return (
			<EmptyState
				title={t("portfolio.history.emptyTitle")}
				body={t("portfolio.history.emptyBody")}
				ctaHref="/launches"
				ctaLabel={t("portfolio.history.browseLaunches")}
				tone="compact"
			/>
		);
	}

	return (
		<div className="border border-stroke-strong rounded-sm overflow-hidden">
			<div className="grid grid-cols-12 gap-3 bg-[#080808] px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
				<div className="col-span-4">{t("portfolio.history.colLaunch")}</div>
				<div className="col-span-2">{t("portfolio.history.colState")}</div>
				<div className="col-span-2 text-right md:text-left">{t("portfolio.history.colInvested")}</div>
				<div className="col-span-2 hidden md:block">{t("portfolio.history.colRealized")}</div>
				<div className="col-span-2 text-right">{t("portfolio.history.colPnl")}</div>
			</div>
			{entries.map((entry) => {
				const { launch } = entry;
				const symbol =
					(typeof launch.metadata?.symbol === "string" ? (launch.metadata.symbol as string) : null) ??
					launch.token.slice(0, 6);
				const name =
					(typeof launch.metadata?.name === "string" ? (launch.metadata.name as string) : null) ??
					t("portfolio.history.launchFallbackName", { idShort: launch.id.slice(0, 8) });
				const { investedWei, realizedWei, pnlWei } = deriveRealized(entry);

				const pnlTone = pnlWei === null ? "neutral" : pnlWei >= 0n ? "positive" : "negative";

				return (
					<div
						key={launch.id}
						className="grid grid-cols-12 gap-3 items-center border-t border-stroke-strong bg-[#0C0C0C] px-4 py-3 text-sm"
					>
						<div className="col-span-4 min-w-0">
							<Link href={`/launch/${encodeURIComponent(launch.id)}`} className="block min-w-0 group">
								<div className="text-white truncate font-medium group-hover:text-[#00ff87] transition-colors">
									{name}
								</div>
								<div className="text-[11px] font-mono text-neutral-500 truncate">${symbol}</div>
							</Link>
						</div>
						<div className="col-span-2">
							<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-400">{launch.state}</span>
						</div>
						<div className="col-span-2 text-right md:text-left text-white tabular-nums">
							{formatBnb(investedWei)} BNB
						</div>
						<div className="col-span-2 hidden md:block text-white tabular-nums">
							{realizedWei !== null ? `${formatBnb(realizedWei)} BNB` : "–"}
						</div>
						<div
							className={`col-span-2 text-right tabular-nums ${
								pnlTone === "positive" ? "text-[#00ff87]" : pnlTone === "negative" ? "text-red-400" : "text-neutral-400"
							}`}
						>
							{pnlWei !== null ? `${formatBnbDelta(pnlWei)} BNB` : "–"}
						</div>
					</div>
				);
			})}
		</div>
	);
}
