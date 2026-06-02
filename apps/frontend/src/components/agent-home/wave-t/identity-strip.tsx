/**
 * IdentityStrip: an elevated, scannable "verified agent" treatment that
 * sits directly under the hero.
 *
 * An agent is now a verifiable ERC-8004 on-chain identity. The hero
 * already carries the ambient `<Erc8004Badge>` next to the name; this
 * strip promotes the identity to a first-class row the moment you land
 * on the page: the verified mark, agent NFT tokenId, owner wallet, chain,
 * and a direct link to the agent's 8004scan profile. The deep record
 * (registry, tx hash, registration file) still lives in the full
 * `<ProvenancePanel>` lower on the page; this strip links down to it.
 *
 * Design rules (wave-T grammar):
 *   - Single Panel, single accent. The verified mark is the only accent;
 *     facts are mono, neutral, tabular.
 *   - Reuses `<Erc8004Badge>` (no duplicate badge markup) for the
 *     verified pill + tooltip + scroll-to-provenance behavior.
 *   - Addresses/ids truncate visually but copy the full value and link
 *     out where a canonical destination exists.
 *
 * Presence behavior:
 *   - Renders NOTHING when `identity` is null. Absence is the honest
 *     default for agents without an on-chain identity.
 */

"use client";

import { ExternalLink } from "lucide-react";

import { build8004ScanUrl, buildScanAddressUrl } from "@/lib/erc8004/client";
import type { Erc8004IdentityRecord } from "@/lib/erc8004/types";
import { cn } from "@/lib/utils";

import { Erc8004Badge } from "../erc8004-badge";
import { Panel } from "./_primitives";

function truncateAddress(addr: string): string {
	if (!addr) return "–";
	const clean = addr.startsWith("0x") ? addr : `0x${addr}`;
	return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

function Fact({
	label,
	value,
	href,
	title,
	accent = false,
}: {
	label: string;
	value: string;
	href?: string | null;
	title?: string;
	accent?: boolean;
}) {
	const valueNode = (
		<span
			title={title ?? value}
			className={cn(
				"font-mono text-[12px] tabular-nums",
				accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
			)}
		>
			{value}
		</span>
	);
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</span>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:text-[var(--accent)]"
				>
					{valueNode}
					<ExternalLink className="h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden="true" />
				</a>
			) : (
				valueNode
			)}
		</div>
	);
}

export function IdentityStrip({ identity }: { identity: Erc8004IdentityRecord | null }) {
	if (!identity) return null;

	const chainLabel = identity.chain === "bsc" ? "bsc mainnet" : identity.chain;
	const scan8004 = build8004ScanUrl(identity);
	const ownerScan = buildScanAddressUrl(identity, identity.ownerWalletAddress);

	return (
		<Panel className="scroll-mt-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
				{/* Left: verified mark + headline. Reuses Erc8004Badge so the
				    tooltip + scroll-to-provenance behavior is identical to the
				    hero, no duplicate markup. */}
				<div className="flex items-center gap-3">
					<Erc8004Badge identity={identity} />
					<div className="flex flex-col">
						<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
							verified agent
						</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							erc-8004 · {chainLabel}
						</span>
					</div>
				</div>

				{/* Right: scannable identity facts. */}
				<div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
					<Fact
						label="agent id"
						value={`#${identity.tokenId}`}
						href={scan8004}
						title={`agent #${identity.tokenId}`}
						accent
					/>
					<Fact
						label="owner wallet"
						value={truncateAddress(identity.ownerWalletAddress)}
						href={ownerScan}
						title={identity.ownerWalletAddress}
					/>
					<div className="col-span-2 flex items-end sm:col-span-1 sm:justify-end">
						<a
							href={scan8004}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								"inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5",
								"border-[var(--border-mid)] bg-[var(--bg-panel-hi)]",
								"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]",
								"transition-colors hover:border-[rgba(0,255,135,0.3)] hover:text-[var(--text-primary)]",
								"focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
							)}
						>
							view on 8004scan
							<ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
						</a>
					</div>
				</div>
			</div>
		</Panel>
	);
}
