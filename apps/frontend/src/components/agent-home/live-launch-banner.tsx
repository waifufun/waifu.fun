"use client";

/**
 * If this agent has a v3 launch in `open` or `closed` state, surface a
 * banner at the top of the agent page linking to /launch/[id]. Skips
 * rendering for `launched` and `failed` (and when no launch row exists).
 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LaunchCountdown } from "@/components/launch-page/launch-countdown";
import { useTranslation } from "@/contexts/locale-context";
import { useLaunchByToken } from "@/hooks/use-post-launch";

type Props = {
	tokenAddress: string;
};

export function LiveLaunchBanner({ tokenAddress }: Props) {
	const { t } = useTranslation();
	const launch = useLaunchByToken(tokenAddress);
	const data = launch.data;

	if (!data) return null;
	if (data.state !== "open" && data.state !== "closed") return null;

	const isOpen = data.state === "open";
	const closeTs = data.closeTimestamp ?? null;

	return (
		<Link
			href={`/launch/${encodeURIComponent(data.id)}`}
			className="group mt-4 flex items-center justify-between gap-4 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-5 py-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/[0.07]"
		>
			<div className="flex min-w-0 items-center gap-3">
				<span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10">
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
				</span>
				<div className="min-w-0">
					<div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]">
						{isOpen ? t("agent.banner.roundLive") : t("agent.banner.awaitingBundle")}
					</div>
					<div className="mt-0.5 truncate text-sm text-[var(--text-primary)]/85">
						{isOpen ? t("agent.banner.depositPrompt") : t("agent.banner.graduationInProgress")}
					</div>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{isOpen && closeTs ? (
					<LaunchCountdown
						closeTimestampSec={closeTs}
						compact
						className="font-mono text-sm tabular-nums text-[var(--accent)]"
					/>
				) : null}
				<ArrowRight className="h-4 w-4 text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
			</div>
		</Link>
	);
}

export default LiveLaunchBanner;
