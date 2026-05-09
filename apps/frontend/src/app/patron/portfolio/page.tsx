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
import { useMemo } from "react";

import PatronHeader from "@/components/patron/patron-header";
import ClaimAllButton from "@/components/portfolio/claim-all-button";
import HistoryTable from "@/components/portfolio/history-table";
import LaunchPositionRow from "@/components/portfolio/launch-position-row";
import NotificationSettings from "@/components/portfolio/notification-settings";
import PortfolioStats from "@/components/portfolio/portfolio-stats";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import useAddress from "@/hooks/use-address";
import { isActive, isClaimable, isHistorical, usePortfolioLaunches } from "@/lib/api/portfolio";
import { aggregatePortfolio } from "@/lib/portfolio/aggregate";
import { Coins, Plug } from "lucide-react";

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
				<EmptyState
					icon={Plug}
					title="connect a wallet to see launches you've backed."
					body="link a wallet on the wallets page, then come back here."
					ctaHref="/patron/wallets"
					ctaLabel="link a wallet"
				/>
			) : null}

			{address && isLoading ? <PortfolioSkeleton /> : null}

			{address && error ? (
				<ErrorState
					title="couldn't load your portfolio."
					message={(error as Error).message}
					onRetry={() => void refetch()}
				/>
			) : null}

			{address && !isLoading && !error && list.length === 0 ? (
				<EmptyState
					icon={Coins}
					title="you haven't backed any launches yet."
					body="deposit BNB on a live round and you'll see your positions here."
					ctaHref="/launches"
					ctaLabel="browse launches"
				/>
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

function PortfolioSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className="rounded-sm border border-stroke-strong bg-[#0C0C0C] p-4">
							<div className="h-3 w-20 bg-white/5 rounded-sm mb-3" />
							<div className="h-5 w-24 bg-white/10 rounded-sm" />
						</div>
					))}
				</div>
				<div className="h-10 w-32 bg-white/5 rounded-sm shrink-0" />
			</div>
			<div className="border border-stroke-strong rounded-sm overflow-hidden">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						key={i}
						className="flex gap-3 items-center bg-[#0C0C0C] px-4 py-4 border-b border-stroke-strong last:border-b-0 relative overflow-hidden"
					>
						<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
						<div className="h-3 w-32 bg-white/10 rounded-sm" />
						<div className="h-3 w-16 bg-white/5 rounded-sm ml-auto" />
						<div className="h-3 w-20 bg-white/5 rounded-sm" />
					</div>
				))}
			</div>
		</div>
	);
}
