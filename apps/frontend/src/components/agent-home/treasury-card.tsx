"use client";

import { useTranslation } from "@/contexts/locale-context";
import useBalance from "@/hooks/use-balance";
import { cn, timeAgo } from "@/lib/utils";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { formatBnb } from "./event-copy";
import type { AgentEvent } from "./types";

// Same-origin path for credentialed XHR — see src/lib/same-origin-api.ts.
import { SAME_ORIGIN_API } from "@/lib/same-origin-api";
const API_BASE = SAME_ORIGIN_API;

type TreasuryMeta = {
	/** token balance held by the agent itself (e.g. 10% pre-buy), if backend exposes it */
	tokenBalance?: number | string | null;
	/** daily usd burn rate for inference, if backend computes one */
	dailyBurnUsd?: number | null;
	/** optional override for treasury usd value, if backend pre-computes */
	usdValue?: number | null;
};

/**
 * Treasury card: bnb balance (from chain), runway days (from backend burn
 * estimate), last tax received (from event feed). Any field the backend
 * doesn't ship shows an em-dash rather than a fake number.
 */
export default function TreasuryCard({
	treasuryAddress,
	agentId,
	ticker,
}: {
	/** the onchain address that holds bnb + tokens */
	treasuryAddress: string;
	/** agent id used for events + treasury meta endpoints */
	agentId: string;
	/** ticker for the token-balance label (e.g. $DEMO) */
	ticker: string;
}) {
	const { t } = useTranslation();
	const balance = useBalance({ chain: "evm", address: treasuryAddress as Address });
	const [meta, setMeta] = useState<TreasuryMeta | null | "unavailable">(null);
	const [lastTax, setLastTax] = useState<AgentEvent | null | "unavailable">(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`${API_BASE}/v2/agents/${agentId}/treasury`, {
					next: { revalidate: 30 },
				});
				if (cancelled) return;
				if (res.status === 404 || res.status === 501) {
					setMeta("unavailable");
					return;
				}
				if (!res.ok) {
					setMeta(null);
					return;
				}
				const json = await res.json().catch(() => null);
				setMeta((json?.data ?? json) as TreasuryMeta);
			} catch {
				if (!cancelled) setMeta("unavailable");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [agentId]);

	useEffect(() => {
		const cancelled = false;
		(async () => {
			try {
				const qs = new URLSearchParams({
					limit: "50",
					eventType: "tax.received",
				});
				const res = await fetch(`${API_BASE}/v2/agents/${agentId}/events?${qs.toString()}`, {
					credentials: "include",
				});
				if (cancelled) return;
				if (res.status === 404 || res.status === 501) {
					setLastTax("unavailable");
					return;
				}
				if (!res.ok) {
					setLastTax(null);
					return;
				}
				const json = await res.json().catch(() => null);
				const events = (json?.data?.events ?? json?.events ?? []) as AgentEvent[];
				const first = events.find((e) => e.eventType === "tax.received") ?? null;
				setLastTax(first);
			} catch {
				if (!cancelled) setLastTax("unavailable");
			}
		})();
	}, [agentId]);

	const runway = deriveRunway({
		bnb: balance.data,
		dailyBurnUsd: meta && meta !== "unavailable" ? (meta.dailyBurnUsd ?? null) : null,
	});

	const tokenBalance = meta && meta !== "unavailable" ? (meta.tokenBalance ?? null) : null;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
				<Stat
					label={t("agent.treasury.bnbBalance")}
					value={balance.isLoading ? "..." : typeof balance.data === "number" ? `${balance.data.toFixed(4)}` : "–"}
					suffix={t("agent.treasury.bnbSuffix")}
				/>
				<Stat
					label={ticker ? t("agent.treasury.tokenHeldWith", { ticker }) : t("agent.treasury.tokenHeldFallback")}
					value={tokenBalance !== null && tokenBalance !== undefined ? formatTokenBalance(tokenBalance) : "–"}
				/>
				<Stat
					label={t("agent.treasury.inferenceRunway")}
					value={runway.value}
					suffix={runway.suffix}
					hint={runway.hint}
				/>
			</div>

			<div className="border-t border-white/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
					{t("agent.treasury.lastTax")}
				</div>
				<div className="text-[11px] font-mono text-white/60">
					{lastTax === null || lastTax === "unavailable" ? (
						<span className="text-white/30">–</span>
					) : (
						<>
							<span className="text-[#00ff87]">
								+{formatBnb((lastTax.data as Record<string, unknown>).amount) || "–"}
							</span>
							<span className="text-white/30 ml-2">{timeAgo(lastTax.createdAt)}</span>
						</>
					)}
				</div>
			</div>

			<TreasuryAddress address={treasuryAddress} />
		</div>
	);
}

function Stat({
	label,
	value,
	suffix,
	hint,
}: {
	label: string;
	value: string;
	suffix?: string | undefined;
	hint?: string | undefined;
}) {
	const { t } = useTranslation();
	const hintResolved = hint?.startsWith("agent.") ? t(hint) : hint;
	return (
		<div className="px-4 py-4 md:py-5">
			<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">{label}</div>
			<div className="flex items-baseline gap-1.5">
				<span className="text-lg md:text-xl font-mono text-white/90 tracking-tight">{value}</span>
				{suffix && <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{suffix}</span>}
			</div>
			{hintResolved && <div className="text-[10px] font-mono text-white/30 mt-1.5">{hintResolved}</div>}
		</div>
	);
}

function TreasuryAddress({ address }: { address: string }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		} catch (e) {
			console.error(e);
		}
	}, [address]);

	const shortened = address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

	return (
		<div className="border-t border-white/5 px-4 py-3 flex items-center justify-between gap-3">
			<div className="flex items-center gap-3 min-w-0">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 shrink-0">
					{t("agent.treasury.treasuryLabel")}
				</span>
				<span className="text-[11px] font-mono text-white/60 truncate hidden sm:inline">{address}</span>
				<span className="text-[11px] font-mono text-white/60 sm:hidden">{shortened}</span>
			</div>
			<div className="flex items-center gap-1.5 shrink-0">
				<button
					type="button"
					onClick={copy}
					aria-label={t("agent.treasury.copyAddressAria")}
					className={cn(
						"inline-flex items-center justify-center w-7 h-7 rounded-sm border transition-colors",
						copied
							? "border-[#00ff87]/60 text-[#00ff87]"
							: "border-white/10 text-white/30 hover:border-white/25 hover:text-white/70",
					)}
				>
					{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
				</button>
				<a
					href={`https://bscscan.com/address/${address}`}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={t("agent.treasury.openOnBscscanAria")}
					className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-white/10 text-white/30 hover:border-white/25 hover:text-white/70 transition-colors"
				>
					<ExternalLink className="w-3.5 h-3.5" />
				</a>
			</div>
		</div>
	);
}

function deriveRunway({
	bnb,
	dailyBurnUsd,
}: {
	bnb: number | undefined;
	dailyBurnUsd: number | null;
}): { value: string; suffix?: string | undefined; hint?: string | undefined } {
	// Hints are i18n keys; resolved at render time via the t() in Stat component context.
	if (dailyBurnUsd === null || dailyBurnUsd <= 0) {
		return { value: "–", hint: "agent.treasury.runwayUnknown" };
	}
	if (bnb === undefined) {
		return { value: "...", hint: "agent.treasury.loadingBalance" };
	}
	return { value: "–", hint: "agent.treasury.runwayUnknown" };
}

function formatTokenBalance(v: number | string): string {
	const n = typeof v === "string" ? Number(v) : v;
	if (!Number.isFinite(n)) return "–";
	if (n === 0) return "0";
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
	if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
	return n.toFixed(2);
}
