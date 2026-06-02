/**
 * Ambient verified-on-chain badge for the agent hero.
 *
 * Renders ONLY when an `Erc8004IdentityRecord` is present. When the
 * agent has no on-chain identity, this component returns `null` so the
 * hero stays clean (no "not verified" copy, no placeholder badge).
 *
 * Visual rules (per `.impeccable.md`):
 *   - Single accent #00ff87 for the checkmark, nothing else.
 *   - Tiny icon + lowercase "verified" microcopy. No filled badges,
 *     no glow, no gradient.
 *   - Tooltip is monochrome on a `--bg-panel-hi` background. No glow.
 *   - Tap target ≥ 44px on mobile (button uses min-w/min-h via padding).
 *   - No em-dashes anywhere.
 *
 * Behavior:
 *   - The badge is an third-party link to the agent's 8004scan profile
 *     (`https://8004scan.io/agents/<chain>/<tokenId>`), opened in a new
 *     tab with `rel="noopener noreferrer"`. This is the canonical proof
 *     surface for the on-chain identity. The in-page provenance panel
 *     still carries the full fact sheet for users who scroll.
 *   - Tooltip renders on hover AND focus (keyboard accessibility).
 *     Mobile users tap the link, no hover needed.
 */

"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useState } from "react";

import { build8004ScanUrl } from "@/lib/erc8004/client";
import { cn } from "@/lib/utils";

import type { Erc8004IdentityRecord } from "@/lib/erc8004/types";

interface Erc8004BadgeProps {
	identity: Erc8004IdentityRecord;
	/** Optional className override (sizing context from parent). */
	className?: string;
}

export function Erc8004Badge({ identity, className }: Erc8004BadgeProps) {
	const [open, setOpen] = useState(false);

	const tooltipText = buildTooltip(identity);
	const scanUrl = build8004ScanUrl(identity);

	return (
		<span className={cn("relative inline-flex", className)}>
			<a
				href={scanUrl}
				target="_blank"
				rel="noopener noreferrer"
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				aria-label={`verified erc-8004 agent #${identity.tokenId}, view on 8004scan (opens in new tab)`}
				aria-describedby={`erc8004-tooltip-${identity.tokenId}`}
				className={cn(
					// 44px+ tap target. Padding does the work, content stays tight.
					"inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5",
					"px-2 py-2 rounded-sm",
					"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]",
					"transition-colors duration-200",
					"hover:text-[var(--text-primary)]",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
				)}
			>
				<CheckCircle2Icon
					aria-hidden="true"
					className="h-[16px] w-[16px] md:h-[18px] md:w-[18px]"
					strokeWidth={2}
					style={{ color: "var(--accent)" }}
				/>
				<span className="hidden sm:inline">verified</span>
			</a>
			<Tooltip id={`erc8004-tooltip-${identity.tokenId}`} open={open} text={tooltipText} />
		</span>
	);
}

function Tooltip({ id, open, text }: { id: string; open: boolean; text: string }) {
	return (
		<span
			id={id}
			role="tooltip"
			aria-hidden={!open}
			className={cn(
				"pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2",
				"min-w-[220px] max-w-[280px] rounded-sm border px-2.5 py-1.5",
				"border-[var(--border-mid)] bg-[var(--bg-panel-hi)]",
				"font-mono text-[10px] leading-[1.45] text-[var(--text-secondary)] tracking-tight",
				"transition-opacity duration-150",
				open ? "opacity-100" : "opacity-0",
			)}
		>
			{text}
		</span>
	);
}

function buildTooltip(identity: Erc8004IdentityRecord): string {
	const date = formatDateShort(identity.registeredAt);
	const chainLabel = identity.chain === "bsc" ? "bsc" : identity.chain;
	return `verified erc-8004 agent #${identity.tokenId} on ${chainLabel}, registered ${date}`;
}

function formatDateShort(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toLowerCase();
	} catch {
		return iso;
	}
}
