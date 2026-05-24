/**
 * AgentTreasuryPanel - itemized on-chain treasury composition for the
 * AgentSafe (per-launch 2/3 Gnosis Safe).
 *
 * Replaces the BNB-only readout in <TreasuryPanelV2> with the full
 * picture: native BNB, every known ERC-20 the safe holds, plus owners +
 * threshold + safe / splitter / treasury-LP addresses.
 *
 * Visual aesthetic: SurfaceCard wrapper, hairline dividers, font-mono
 * micro-caps labels, sharp corners, single accent #00ff87.
 *
 * Live data: all rows read direct from BSC RPC via wagmi. Tolerates
 * per-row failures (constraint: we got bit by allowFailure:false on the
 * launch page tonight; not repeating that).
 */
"use client";

import { Check, Copy, ExternalLink, Shield } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";

import { SurfaceCard } from "@/components/ui/surface-card";
import { useTranslation } from "@/contexts/locale-context";
import { type TokenSpec, type TreasuryHolding, useAgentTreasury } from "@/hooks/use-agent-treasury";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

export interface AgentTreasuryPanelProps {
	/** The launched agent token (e.g. $WAIFU at 0x15fc60...77777). Always tracked. */
	tokenAddress: string;
	tokenSymbol: string;
	/** Optional pre-fetched launch row; supplies AgentSafe + owners + threshold. */
	launch: AgentLaunchByToken | null;
	/**
	 * Optional extra tokens to track (e.g. WBNB, USDT once the agent moves into
	 * stable bookkeeping). The agent token itself is added automatically.
	 */
	extraTokens?: TokenSpec[];
}

/**
 * Format a string-decimal balance for display:
 *   - >= 1M  -> 1.23M
 *   - >= 1k  -> 1.23k
 *   - >= 1   -> 1.2345 (4dp)
 *   - else   -> 0.0000xx (preserve leading non-zero precision)
 */
function fmtBalance(formatted: string): string {
	const v = Number.parseFloat(formatted);
	if (!Number.isFinite(v) || v === 0) return "0";
	const abs = Math.abs(v);
	if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
	if (abs >= 1) return v.toFixed(4);
	return v.toPrecision(2);
}

export default function AgentTreasuryPanel({
	tokenAddress,
	tokenSymbol,
	launch,
	extraTokens = [],
}: AgentTreasuryPanelProps) {
	const { t } = useTranslation();
	const agentSafe = launch?.agentSafe ?? null;
	const safeValid = !!agentSafe && isAddress(agentSafe);
	const treasuryLp = launch?.treasuryLp ?? null;
	const taxSplitter = launch?.taxSplitter ?? null;
	const owners = launch?.agentSafeConfig?.owners ?? [];
	const threshold = launch?.agentSafeConfig?.threshold ?? null;

	// Always track the agent's own token. Decimals = 18 is the contract
	// standard; if a future launch ships a non-18-decimal token, drop the
	// override so the hook reads `decimals()`.
	const tracked: TokenSpec[] = useMemo(() => {
		const agentTokenAddr = isAddress(tokenAddress) ? (tokenAddress as Address) : null;
		const base: TokenSpec[] = agentTokenAddr
			? [{ address: agentTokenAddr, symbol: tokenSymbol || "TOKEN", decimals: 18 }]
			: [];
		// De-dupe extras vs the agent token to avoid double-counting.
		const seen = new Set(base.map((t) => t.address.toLowerCase()));
		for (const t of extraTokens) {
			if (!seen.has(t.address.toLowerCase())) {
				base.push(t);
				seen.add(t.address.toLowerCase());
			}
		}
		return base;
	}, [tokenAddress, tokenSymbol, extraTokens]);

	const snapshot = useAgentTreasury(safeValid ? (agentSafe as Address) : null, tracked);

	// Flatten holdings: native first, then tokens (descending by raw balance
	// magnitude doesn't make sense across assets, so we keep the declared
	// ordering - agent token first, extras after).
	const holdings: TreasuryHolding[] = useMemo(() => {
		const list: TreasuryHolding[] = [];
		if (snapshot.native) list.push(snapshot.native);
		for (const t of snapshot.tokens) list.push(t);
		return list;
	}, [snapshot.native, snapshot.tokens]);

	if (!safeValid) {
		return (
			<SurfaceCard padding="md">
				<div className="font-mono text-[11px] text-white/40">{t("agent.safe.notConfigured")}</div>
			</SurfaceCard>
		);
	}

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			{/* Header row: safe address + owner threshold + bscscan link */}
			<div className="flex flex-col gap-1 border-b border-white/[0.06] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
				<div className="flex flex-col gap-1 min-w-0">
					<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
						<Shield className="h-3 w-3" strokeWidth={1.5} />
						{t("agent.safe.agentSafe")}
						{threshold && owners.length > 0 ? (
							<span className="text-white/30">
								{t("agent.safe.multisigSuffix", { threshold: String(threshold), total: String(owners.length) })}
							</span>
						) : null}
					</div>
					<AddressLine address={agentSafe as string} />
				</div>
				<ScanLink address={agentSafe as string} label={t("agent.safe.bscscanLabel")} />
			</div>

			{/* Holdings list */}
			<div className="divide-y divide-white/[0.06]">
				{holdings.length === 0 && !snapshot.isLoading ? (
					<div className="px-5 py-6 text-center font-mono text-[11px] text-white/35 md:px-6">
						{t("agent.safe.noHoldings")}
					</div>
				) : null}
				{snapshot.isLoading && holdings.length === 0 ? (
					<div className="px-5 py-6 md:px-6">
						<div
							className="h-6 w-40 animate-pulse rounded-sm bg-white/[0.04]"
							aria-label={t("agent.safe.loadingComposition")}
						/>
					</div>
				) : null}
				{holdings.map((h) => (
					<HoldingRow key={h.kind === "native" ? "native" : h.address} holding={h} />
				))}
			</div>

			{/* Footer chrome: linked sister contracts (splitter + treasury LP) */}
			{(taxSplitter || treasuryLp) && (
				<div className="border-t border-white/[0.06] bg-[#06060a] px-5 py-3 md:px-6">
					<div className="grid gap-2 md:grid-cols-2">
						{taxSplitter ? (
							<SisterContractRow
								label={t("agent.safe.taxSplitterLabel")}
								intent={t("agent.safe.taxSplitterIntent")}
								address={taxSplitter}
							/>
						) : null}
						{treasuryLp ? (
							<SisterContractRow
								label={t("agent.safe.treasuryLpLabel")}
								intent={t("agent.safe.treasuryLpIntent")}
								address={treasuryLp}
							/>
						) : null}
					</div>
				</div>
			)}
		</SurfaceCard>
	);
}

function HoldingRow({ holding }: { holding: TreasuryHolding }) {
	const { t } = useTranslation();
	const isNative = holding.kind === "native";
	const tokenAddress = !isNative ? holding.address : null;
	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 md:px-6">
			<div className="flex items-center gap-3 min-w-0">
				<TokenBadge symbol={holding.symbol} />
				<div className="flex flex-col min-w-0">
					<span className="font-mono text-[12px] text-white/85 truncate">{holding.symbol}</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35 truncate">
						{isNative ? t("agent.safe.nativeChain") : t("agent.safe.erc20")}
					</span>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<span className="font-mono text-[14px] tabular-nums text-white/90">{fmtBalance(holding.formatted)}</span>
				{tokenAddress ? <ScanLink address={tokenAddress} label={t("agent.safe.openTokenAria")} /> : null}
			</div>
		</div>
	);
}

function SisterContractRow({ label, intent, address }: { label: string; intent: string; address: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-sm border border-white/[0.06] bg-[#08080a] px-3 py-2">
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">{label}</span>
				<span className="font-mono text-[10px] text-white/40 truncate">{intent}</span>
				<span className="font-mono text-[10px] tabular-nums text-white/55 truncate" title={address}>
					{shortenAddress(address)}
				</span>
			</div>
			<ScanLink address={address} compact />
		</div>
	);
}

function TokenBadge({ symbol }: { symbol: string }) {
	const initial = (symbol || "?").trim().slice(0, 2).toUpperCase();
	return (
		<span
			aria-hidden
			className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-white/[0.08] bg-white/[0.03] font-mono text-[9px] uppercase tracking-[0.12em] text-white/65"
		>
			{initial}
		</span>
	);
}

function shortenAddress(address: string): string {
	if (address.length <= 12) return address;
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AddressLine({ address }: { address: string }) {
	const { t } = useTranslation();
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

	return (
		<div className="inline-flex items-center gap-2">
			<span className="hidden font-mono text-[11px] tabular-nums text-white/75 sm:inline" title={address}>
				{address}
			</span>
			<span className="font-mono text-[11px] tabular-nums text-white/75 sm:hidden">{shortenAddress(address)}</span>
			<button
				type="button"
				onClick={onCopy}
				aria-label={copied ? t("agent.safe.copiedAria") : t("agent.safe.copySafeAria")}
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

function ScanLink({ address, label, compact }: { address: string; label?: string; compact?: boolean }) {
	const { t } = useTranslation();
	const cls = compact
		? "inline-flex h-6 w-6 items-center justify-center rounded-sm border border-white/10 text-white/35 transition-colors hover:border-white/25 hover:text-white/75"
		: "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-white/35 transition-colors hover:border-white/25 hover:text-white/75";
	return (
		<a
			href={`https://bscscan.com/address/${address}`}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={label ? t("agent.safe.openLabelAria", { label }) : t("agent.safe.openOnBscscan")}
			className={cls}
		>
			<ExternalLink className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={1.5} />
		</a>
	);
}
