/**
 * SunsetBanner: shown on an agent page when `agent.status === "sunset"`.
 *
 * Presence-driven, not identity-driven — the page renders this whenever the
 * agent's lifecycle status is `sunset`, the same way LiveLaunchBanner renders
 * off a live deposit window. No hardcoded address check.
 *
 * Purpose: when a token is wound down, the agent page must say so plainly and
 * point holders at the reconciliation, instead of showing a (now meaningless)
 * price chart + swap box. Honest wind-down, with receipts.
 *
 * Chrome + colors come from the shared wave-t primitives / THEME_TOKENS
 * (Panel, Label, --neutral, --text-*, --accent) per the page's UI contract —
 * no bespoke panels, no unsanctioned colors.
 */

import Link from "next/link";
import { Label, Panel } from "./wave-t/_primitives";

export interface SunsetBannerProps {
	/** Optional URL to the public post-mortem / sunset write-up. */
	postmortemUrl?: string;
	/** Optional URL to the reconciliation claim page. */
	claimUrl?: string;
}

export default function SunsetBanner({
	postmortemUrl = "https://shad0w.xyz/logs/sunsetting-the-launchpad/",
	claimUrl,
}: SunsetBannerProps) {
	return (
		<Panel className="mt-4">
			<Label>
				<span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--neutral)]" />
				Token sunset — wind-down in progress
			</Label>
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<p className="max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
					This token has been retired. Trading is closed and the chart is no longer meaningful. The agent treasury is
					being wound down and distributed back to holders pro-rata via an on-chain reconciliation. The agent itself
					lives on.
				</p>
				<div className="flex shrink-0 flex-wrap gap-2">
					{claimUrl ? (
						<Link
							href={claimUrl}
							className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-base)] transition hover:bg-[var(--accent-dim)]"
						>
							Check your claim
						</Link>
					) : null}
					<a
						href={postmortemUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-md border border-[var(--border-mid)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--text-secondary)]"
					>
						Read what happened
					</a>
				</div>
			</div>
		</Panel>
	);
}
