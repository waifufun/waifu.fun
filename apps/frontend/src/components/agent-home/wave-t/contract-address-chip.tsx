"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Copyable contract-address chip for the hero ticker row.
 *
 * Renders as a single inline pill matching the StatPill grammar.
 * Click copies to clipboard, brief check-mark confirms, then reverts.
 * A small third-party-link icon links to bscscan in a new tab.
 *
 * Honesty:
 * - The full address is in the title attribute so power-users can also
 *   long-press / right-click to inspect.
 * - The visible text is truncated to first6...last4 to fit alongside
 *   ticker / chain pills without crowding the bio.
 */
export function ContractAddressChip({ address }: { address: string }) {
	const [copied, setCopied] = useState(false);
	const cleaned = address.startsWith("0x") ? address : `0x${address}`;
	const short = `${cleaned.slice(0, 6)}…${cleaned.slice(-4)}`;
	const scanUrl = `https://bscscan.com/token/${cleaned}`;

	async function copy() {
		try {
			await navigator.clipboard.writeText(cleaned);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			// clipboard may be unavailable in iframes / older browsers; silently skip
		}
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm px-2 py-[3px]",
				"border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)]",
				"font-mono text-[10px] uppercase tracking-[0.12em]",
				"text-[var(--text-secondary)]",
				"transition-colors duration-200",
				"hover:border-[rgba(0,255,135,0.2)] hover:text-[var(--text-primary)]",
			)}
			title={cleaned}
		>
			<button
				type="button"
				onClick={copy}
				className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
				aria-label={copied ? "contract address copied" : "copy contract address"}
			>
				<span>{short}</span>
				{copied ? (
					<Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
				) : (
					<Copy className="h-3 w-3 opacity-60" strokeWidth={1.75} aria-hidden="true" />
				)}
			</button>
			<a
				href={scanUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center text-[var(--text-secondary)] opacity-60 hover:opacity-100 transition-opacity"
				aria-label="open contract on bscscan"
			>
				<ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
			</a>
		</span>
	);
}
