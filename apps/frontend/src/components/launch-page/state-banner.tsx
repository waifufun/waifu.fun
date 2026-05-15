"use client";

import type { LaunchDisplayState } from "@/lib/launch-vault/launch-display-state";
import { cn } from "@/lib/utils";

type Props = {
	state: LaunchDisplayState;
	className?: string;
};

const COPY: Record<LaunchDisplayState, { title: string; body: string }> = {
	created: {
		title: "presale opens shortly",
		body: "the agent is provisioned. once the round opens you can deposit bnb to claim your allocation.",
	},
	presale: {
		title: "presale open",
		body: "deposit bnb during the window. allocations are pro-rata at close.",
	},
	closed: {
		title: "waiting for bundle bot",
		body: "presale closed. the bundle is being prepared for the next puissant block. usually under a minute.",
	},
	bundling: {
		title: "bundle bot working, eta ~30s",
		body: "submitting deploy + buys atomically to puissant. token address surfaces once the block lands.",
	},
	launched: {
		title: "launched. claim available",
		body: "trading is live on pcs. claim your tokens below. vesting (if any) drips over the first 24h.",
	},
	refunding: {
		title: "refunds open",
		body: "the bundle didn't land or the cap wasn't met. you can pull your principal plus a share of the bonus pool.",
	},
};

const TONE: Record<LaunchDisplayState, string> = {
	created: "border-yellow-400/30 bg-yellow-400/[0.04] text-yellow-100",
	presale: "border-[#00ff87]/30 bg-[#00ff87]/[0.04] text-[#d6ffe9]",
	closed: "border-yellow-400/30 bg-yellow-400/[0.04] text-yellow-100",
	bundling: "border-yellow-400/30 bg-yellow-400/[0.04] text-yellow-100",
	launched: "border-blue-400/30 bg-blue-400/[0.04] text-blue-100",
	refunding: "border-red-400/30 bg-red-400/[0.04] text-red-100",
};

const ICON_TONE: Record<LaunchDisplayState, string> = {
	created: "bg-yellow-300",
	presale: "bg-[#00ff87] animate-pulse",
	closed: "bg-yellow-300",
	bundling: "bg-yellow-300 animate-pulse",
	launched: "bg-blue-300",
	refunding: "bg-red-300",
};

export function StateBanner({ state, className }: Props) {
	const copy = COPY[state];
	return (
		<div
			className={cn("flex items-start gap-3 border px-4 py-3", TONE[state], className)}
			role="status"
			aria-live="polite"
			data-testid="launch-state-banner"
			data-state={state}
		>
			<span className={cn("mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0", ICON_TONE[state])} aria-hidden />
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="text-sm font-medium leading-tight">{copy.title}</span>
				<span className="text-[12px] leading-relaxed text-zinc-300/90">{copy.body}</span>
			</div>
		</div>
	);
}
