"use client";

import { type Address, isAddress } from "viem";

import { useLaunchByToken } from "@/hooks/use-post-launch";

import { BurnCounter } from "./burn-counter";
import { ClaimWidget } from "./claim-widget";
import { TaxStreamStats } from "./tax-stream-stats";
import { TierLadder } from "./tier-ladder";

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

	if (!launch.data) return null;
	if (launch.data.state !== "launched") return null;

	const data = launch.data;
	const vault = isAddress(data.vault) ? (data.vault as Address) : undefined;
	const treasuryLp = data.treasuryLp && isAddress(data.treasuryLp) ? (data.treasuryLp as Address) : undefined;
	const token = isAddress(data.token) ? (data.token as Address) : undefined;

	// Tax split metadata is stored on the legacy `launches` row, not the
	// agent_launches one. The post-launch indexer ports the splitter address
	// over via the metadata blob; until then we read it best-effort.
	const meta = (data.metadata ?? {}) as Record<string, unknown>;
	const taxSplitterRaw = typeof meta.taxSplitter === "string" ? meta.taxSplitter : null;
	const agentBpsRaw = typeof meta.agentBps === "number" ? meta.agentBps : null;
	const patronBpsRaw = typeof meta.patronBps === "number" ? meta.patronBps : null;
	const taxSplitter = taxSplitterRaw && isAddress(taxSplitterRaw) ? (taxSplitterRaw as Address) : null;

	return (
		<div className="mt-10 flex flex-col gap-5">
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
						taxSplitter={taxSplitter}
						treasuryLp={treasuryLp}
						agentBps={agentBpsRaw}
						patronBps={patronBpsRaw}
					/>
				</div>
			</div>
		</div>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">{children}</div>;
}
