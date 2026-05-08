"use client";

/**
 * W51 patron dashboard.
 *
 * Shows every launch the connected wallet has backed (deposited into),
 * with a portfolio overview, claimable totals, full position table,
 * historical p&l, and notification settings.
 *
 * The page leans on the backend `/v2/users/:address/launches` endpoint
 * for aggregation. When the endpoint is unavailable (404), the hook
 * returns an empty list and the UI shows the empty state.
 */
import Link from "next/link";
import { useMemo } from "react";

import PatronHeader from "@/components/patron/patron-header";
import ClaimAllButton from "@/components/portfolio/claim-all-button";
import HistoryTable from "@/components/portfolio/history-table";
import LaunchPositionRow from "@/components/portfolio/launch-position-row";
import NotificationSettings from "@/components/portfolio/notification-settings";
import PortfolioStats from "@/components/portfolio/portfolio-stats";
import useAddress from "@/hooks/use-address";
import { isActive, isClaimable, isHistorical, usePortfolioLaunches } from "@/lib/api/portfolio";
import { aggregatePortfolio } from "@/lib/portfolio/aggregate";

export default function PortfolioPage() {
	const address = useAddress();
	const { data: entries, isLoading, error, refetch } = usePortfolioLaunches(address);

	const list = entries ?? [];

	// Active = open or closed (still pre-distribution)
	// Claimable = launched + claimable > 0
	// History = launched + done, or failed
	const active = useMemo(() => list.filter(isActive), [list]);
	const claimableEntries = useMemo(() => list.filter(isClaimable), [list]);
	const history = useMemo(() => list.filter(isHistorical), [list]);

	const totals = useMemo(() => aggregatePortfolio(list), [list]);

	return (
		<main className="py-6">
			<PatronHeader
				title="portfolio"
				subtitle="every launch you've backed, with claimable balances and realized p&l."
				backHref="/patron"
			/>

			{!address ? (
				<div className="rounded-sm border border-stroke-strong bg-[#0C0C0C] p-6 text-sm text-neutral-400">
					connect a wallet to see launches you've backed.{" "}
					<Link href="/patron/wallets" className="text-[#00ff87] hover:underline">
						link a wallet
					</Link>
				</div>
			) : null}

			{address && isLoading ? (
				<div className="rounded-sm border border-stroke-strong bg-[#0C0C0C] p-6 text-sm text-neutral-500">
					loading positions…
				</div>
			) : null}

			{address && error ? (
				<div className="rounded-sm border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
					failed to load portfolio: {(error as Error).message}
				</div>
			) : null}

			{address && !isLoading && !error && list.length === 0 ? (
				<div className="rounded-sm border border-stroke-strong bg-[#0C0C0C] p-6 text-sm text-neutral-400">
					you haven't backed any launches yet.{" "}
					<Link href="/launch" className="text-[#00ff87] hover:underline">
						browse launches
					</Link>
				</div>
			) : null}

			{address && list.length > 0 ? (
				<>
					<div className="flex flex-col gap-4 mb-6 md:flex-row md:items-end md:justify-between">
						<PortfolioStats totals={totals} />
						<ClaimAllButton
							entries={claimableEntries}
							onAllDone={() => {
								void refetch();
							}}
						/>
					</div>

					<section className="mb-8">
						<h2 className="text-sm font-mono uppercase tracking-[0.2em] text-neutral-400 mb-3">
							active positions ({active.length + claimableEntries.length})
						</h2>
						{active.length + claimableEntries.length === 0 ? (
							<div className="rounded-sm border border-stroke-strong bg-[#0C0C0C] px-4 py-6 text-center text-sm text-neutral-500">
								no active positions. all launches have settled.
							</div>
						) : (
							<div className="border border-stroke-strong rounded-sm overflow-hidden">
								{[...claimableEntries, ...active].map((entry) => (
									<LaunchPositionRow key={entry.launch.id} entry={entry} />
								))}
							</div>
						)}
					</section>

					<section className="mb-8">
						<h2 className="text-sm font-mono uppercase tracking-[0.2em] text-neutral-400 mb-3">
							history ({history.length})
						</h2>
						<HistoryTable entries={history} />
					</section>
				</>
			) : null}

			<section className="mb-8">
				<NotificationSettings />
			</section>
		</main>
	);
}
