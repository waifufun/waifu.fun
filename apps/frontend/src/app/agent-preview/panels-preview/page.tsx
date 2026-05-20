/**
 * Worker B v2 isolated panel preview.
 *
 * SSR-prefetches the data each panel needs and renders the five panels
 * Worker B owns: price-chart, swap-panel, holdings-allocation,
 * active-positions, pnl-chart. Worker A wires these into the main
 * agent-preview dashboard.tsx; this page exists for review screenshots
 * and visual regression.
 */

import { ActivePositions } from "../_panels/active-positions";
import { HoldingsAllocation } from "../_panels/holdings-allocation";
import { PnlChart } from "../_panels/pnl-chart";
import { PriceChart } from "../_panels/price-chart";
import { SwapPanel } from "../_panels/swap-panel";
import { fetchCandleSeries } from "../lib/candles";
import { fetchHoldings } from "../lib/holdings";
import { fetchPositions } from "../lib/positions";
import { fetchTokenMetrics } from "../lib/token";

const PREVIEW_TOKEN = "0x55d398326f99059fF775485246999027B3197955"; // USDT BSC for stable preview

export const dynamic = "force-static";

export default async function PanelsPreviewPage() {
	const [token, candles, holdings, positions] = await Promise.all([
		fetchTokenMetrics(PREVIEW_TOKEN),
		fetchCandleSeries(PREVIEW_TOKEN, "1h"),
		fetchHoldings(),
		fetchPositions(),
	]);

	return (
		<main className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
			<div className="mx-auto max-w-[1380px] space-y-4">
				<header className="border-b border-[var(--border-soft)] pb-3">
					<h1 className="font-mono text-[12px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
						wave T worker B v2 · panel preview
					</h1>
					<p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						isolated rendering of the five panels (chart / swap / holdings / positions / pnl)
					</p>
				</header>

				{/* Row 1: chart + swap */}
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
					<PriceChart initialSeries={candles} token={token} />
					<SwapPanel token={token} />
				</div>

				{/* Row 2: 3 new panels */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<HoldingsAllocation snapshot={holdings} />
					<ActivePositions positions={positions} />
					<PnlChart />
				</div>
			</div>
		</main>
	);
}
