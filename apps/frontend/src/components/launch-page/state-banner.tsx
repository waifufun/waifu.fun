"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { LaunchDisplayState } from "@/lib/launch-vault/launch-display-state";
import { cn } from "@/lib/utils";

type Props = {
	state: LaunchDisplayState;
	className?: string;
};

const COPY_KEYS: Record<LaunchDisplayState, { titleKey: string; bodyKey: string }> = {
	created: {
		titleKey: "launch.stateBanner.createdTitle",
		bodyKey: "launch.stateBanner.createdBody",
	},
	presale: {
		titleKey: "launch.stateBanner.presaleTitle",
		bodyKey: "launch.stateBanner.presaleBody",
	},
	closed: {
		titleKey: "launch.stateBanner.closedTitle",
		bodyKey: "launch.stateBanner.closedBody",
	},
	bundling: {
		titleKey: "launch.stateBanner.bundlingTitle",
		bodyKey: "launch.stateBanner.bundlingBody",
	},
	launched: {
		titleKey: "launch.stateBanner.launchedTitle",
		bodyKey: "launch.stateBanner.launchedBody",
	},
	refunding: {
		titleKey: "launch.stateBanner.refundingTitle",
		bodyKey: "launch.stateBanner.refundingBody",
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
	const { t } = useTranslation();
	const keys = COPY_KEYS[state];
	return (
		<output
			className={cn("flex items-start gap-3 border px-4 py-3", TONE[state], className)}
			aria-live="polite"
			data-testid="launch-state-banner"
			data-state={state}
		>
			<span className={cn("mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0", ICON_TONE[state])} aria-hidden />
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="text-sm font-medium leading-tight">{t(keys.titleKey)}</span>
				<span className="text-[12px] leading-relaxed text-zinc-300/90">{t(keys.bodyKey)}</span>
			</div>
		</output>
	);
}
