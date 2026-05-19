/**
 * TreasuryPanelV2. Single SurfaceCard with three rows for the three
 * wave-M / wave-N onchain handles:
 *
 *   - TreasuryLP4 (multi-tier LP holder)
 *   - AgentSafe (per-launch Gnosis Safe controlled by the patron)
 *   - TaxSplitter (10/25/65 default split router)
 *
 * Each row shows: label + intent, full address (truncated on mobile),
 * BNB balance (live from useBalance), copy + bscscan affordances.
 *
 * Hairline-divided. No three-card stat dump. When a handle is missing
 * the row renders a quiet 'not configured' state rather than vanishing,
 * so the panel's vertical rhythm stays stable.
 */
"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";
import type { Address } from "viem";

import { SurfaceCard } from "@/components/ui/surface-card";
import useBalance from "@/hooks/use-balance";
import { cn } from "@/lib/utils";

export interface TreasuryPanelV2Props {
	treasuryLp: string | null;
	agentSafe: string | null;
	taxSplitter: string | null;
}

export default function TreasuryPanelV2({ treasuryLp, agentSafe, taxSplitter }: TreasuryPanelV2Props) {
	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			<div className="divide-y divide-white/[0.06]">
				<TreasuryRow label="treasury lp" address={treasuryLp} intent="multi-tier liquidity holder" showBalance />
				<TreasuryRow label="agent safe" address={agentSafe} intent="patron-controlled gnosis safe" showBalance />
				<TreasuryRow label="tax splitter" address={taxSplitter} intent="routes buy/sell tax" showBalance={false} />
			</div>
		</SurfaceCard>
	);
}

function TreasuryRow({
	label,
	address,
	intent,
	showBalance,
}: {
	label: string;
	address: string | null;
	intent: string;
	showBalance: boolean;
}) {
	if (!address) {
		return (
			<div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 md:px-6">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">{label}</span>
					<span className="text-[11px] text-white/35">{intent}</span>
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">not configured</span>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center md:gap-6 md:px-6">
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</span>
				<span className="text-[11px] text-white/40">{intent}</span>
				<AddressLine address={address} />
			</div>
			<div className="flex items-center justify-between gap-3 md:justify-end">
				{showBalance ? (
					<BnbBalance address={address as Address} />
				) : (
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">router</span>
				)}
				<ScanLink address={address} />
			</div>
		</div>
	);
}

function AddressLine({ address }: { address: string }) {
	const [copied, setCopied] = useState(false);
	const onCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		} catch (err) {
			console.error("clipboard copy failed", err);
		}
	}, [address]);

	const shortened = address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

	return (
		<div className="mt-1.5 inline-flex items-center gap-2">
			<span className="hidden font-mono text-[11px] tabular-nums text-white/65 sm:inline" title={address}>
				{address}
			</span>
			<span className="font-mono text-[11px] tabular-nums text-white/65 sm:hidden">{shortened}</span>
			<button
				type="button"
				onClick={onCopy}
				aria-label={copied ? "copied" : "copy address"}
				className={cn(
					"inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors duration-200",
					copied
						? "border-[#00ff87]/60 text-[#00ff87]"
						: "border-white/10 text-white/35 hover:border-white/25 hover:text-white/75",
				)}
			>
				{copied ? <Check className="h-3 w-3" strokeWidth={2} /> : <Copy className="h-3 w-3" strokeWidth={1.5} />}
			</button>
		</div>
	);
}

function BnbBalance({ address }: { address: Address }) {
	const balance = useBalance({ chain: "evm", address });
	const value = balance.isLoading ? "..." : typeof balance.data === "number" ? balance.data.toFixed(4) : "–";
	return (
		<span className="inline-flex items-baseline gap-1">
			<span className="font-mono text-[14px] tabular-nums text-white/90">{value}</span>
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">bnb</span>
		</span>
	);
}

export function ScanLink({ address }: { address: string }) {
	return (
		<a
			href={`https://bscscan.com/address/${address}`}
			target="_blank"
			rel="noreferrer"
			className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-white/35 transition-colors hover:border-white/25 hover:text-white/75"
			aria-label="open on bscscan"
		>
			<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
		</a>
	);
}
