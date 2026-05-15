"use client";

import { type Address, isAddress } from "viem";

import { useLaunchByToken } from "@/hooks/use-post-launch";
import { usePostLaunchMarket } from "@/hooks/use-post-launch-market";

import { BurnCounter } from "./burn-counter";
import { ClaimWidget } from "./claim-widget";
import { TaxStreamStats } from "./tax-stream-stats";
import { TierLadder } from "./tier-ladder";
import { TokenChart } from "./token-chart";
import { TradeActivityFeed } from "./trade-activity-feed";

type Props = {
	tokenAddress: string;
	ticker: string;
};

/**
 * V3 launch sections for the agent page. Detects v3 via
 * `GET /v2/launches/by-token/:tokenAddress`; renders nothing while the
 * lookup is pending or when the token is not a v3 launch (the existing
 * /agent surface handles those cases).
 *
 * State machine:
 *   open      \u2192 don't render here (the deposit window is handled by /launch/[id]).
 *   closed    \u2192 don't render here (awaiting bundle execution).
 *   launched  \u2192 render the four post-launch panels.
 *   failed    \u2192 don't render here (the existing page already shows the error state).
 */
export function PostLaunchSurface({ tokenAddress, ticker }: Props) {
	const launch = useLaunchByToken(tokenAddress);

	// Order matters: hooks above any conditional returns. The launched-token
	// address comes from either the launch row (post-bundle) or the input
	// address itself; we feed the market hook either, gated by the data path.
	const data = launch.data;
	const tokenFromLaunch = data && isAddress(data.token) ? (data.token as Address) : undefined;
	const marketTokenAddress = tokenFromLaunch ?? (isAddress(tokenAddress) ? (tokenAddress as Address) : undefined);
	const market = usePostLaunchMarket(marketTokenAddress, Boolean(marketTokenAddress));

	if (!data) return null;
	if (data.state !== "launched") return null;

	const vault = isAddress(data.vault) ? (data.vault as Address) : undefined;
	const treasuryLp = data.treasuryLp && isAddress(data.treasuryLp) ? (data.treasuryLp as Address) : undefined;
	const token = tokenFromLaunch;

	// Tax split metadata is stored on the legacy `launches` row, not the
	// agent_launches one. The post-launch indexer ports the splitter address
	// over via the metadata blob; until then we read it best-effort.
	const meta = (data.metadata ?? {}) as Record<string, unknown>;
	const taxSplitterRaw = typeof meta.taxSplitter === "string" ? meta.taxSplitter : null;
	const agentBpsRaw = typeof meta.agentBps === "number" ? meta.agentBps : null;
	const patronBpsRaw = typeof meta.patronBps === "number" ? meta.patronBps : null;
	const taxSplitter = taxSplitterRaw && isAddress(taxSplitterRaw) ? (taxSplitterRaw as Address) : null;

	return (
		<section className="mt-10 flex flex-col gap-5" aria-label="post-launch surface" data-testid="post-launch-surface">
			{token ? (
				<>
					<SectionHeader>price chart</SectionHeader>
					<TokenChart
						tokenAddress={token}
						pairAddress={market.data?.pairAddress ?? null}
						pairUrl={market.data?.pairUrl ?? null}
					/>
				</>
			) : null}

			<SectionHeader>tier ladder</SectionHeader>
			<TierLadder treasuryLp={treasuryLp} />

			<SectionHeader>burn counter</SectionHeader>
			<BurnCounter tokenAddress={token} ticker={ticker} />

			<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div className="flex flex-col gap-3">
					<SectionHeader>claim</SectionHeader>
					<ClaimWidget
						vault={vault}
						ticker={ticker}
						vestingEnabled={data.vestingEnabled}
						launchTimestamp={data.launchTimestamp}
					/>
				</div>
				<div className="flex flex-col gap-3">
					<SectionHeader>tax stream</SectionHeader>
					<TaxStreamStats
						taxSplitter={taxSplitter ?? null}
						treasuryLp={treasuryLp ?? null}
						agentBps={agentBpsRaw ?? null}
						patronBps={patronBpsRaw ?? null}
					/>
				</div>
			</div>

			{token ? (
				<>
					<SectionHeader>trade activity</SectionHeader>
					<TradeActivityFeed market={market.data ?? null} tokenAddress={token} isLoading={market.isLoading} />
				</>
			) : null}
		</section>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">{children}</div>;
}
