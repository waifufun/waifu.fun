"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { parseEther } from "viem";
import useBalance from "@/hooks/use-balance";
import { useXConnection } from "@/lib/api/x-connection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
	agentId: string;
	safeAddress: string | null | undefined;
	/** Wired to the authorize endpoint in commit 4. */
	onLaunch?: (firstBuyWei: string) => void;
	/** When the parent is mid-flight against the authorize call. */
	isLaunching?: boolean;
};

type Preset = "all" | "half" | "quarter" | "zero";

const PRESET_ORDER: Preset[] = ["all", "half", "quarter", "zero"];
const PRESET_LABELS: Record<Preset, string> = {
	all: "All",
	half: "Half",
	quarter: "Quarter",
	zero: "0",
};
const PRESET_FRACTION: Record<Preset, number> = {
	all: 1,
	half: 0.5,
	quarter: 0.25,
	zero: 0,
};

/**
 * useSafeBalance
 *
 * Thin wrapper over the existing wagmi/viem helper. Returns BNB as a number
 * (already formatted). Returns `null` when the address is missing or the
 * RPC call hasn't resolved yet — callers render a `—` placeholder.
 */
export function useSafeBalance(safeAddress: string | null | undefined) {
	const { data, isLoading, error, refetch } = useBalance({
		chain: "evm",
		address: (safeAddress ?? undefined) as Address | undefined,
	});
	return {
		balance: typeof data === "number" ? data : null,
		isLoading,
		error: error as Error | null,
		refetch,
	};
}

function CopyIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<rect x="5" y="5" width="9" height="9" rx="1.5" />
			<path d="M3 11V3a1 1 0 0 1 1-1h7" />
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M3 8.5l3 3L13 5" />
		</svg>
	);
}

function ExternalLinkIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M9 3h4v4" />
			<path d="M13 3l-7 7" />
			<path d="M11 9v3.5A1.5 1.5 0 0 1 9.5 14h-6A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H7" />
		</svg>
	);
}

function ShieldIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M8 1.5L2.5 3.5v4c0 3 2.4 5.6 5.5 7 3.1-1.4 5.5-4 5.5-7v-4L8 1.5z" />
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={cn("animate-spin", className)}>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
			<path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}

function shortAddress(addr: string | null | undefined): string {
	if (!addr) return "—";
	if (addr.length <= 14) return addr;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBnb(n: number | null | undefined, digits = 4): string {
	if (n == null || Number.isNaN(n)) return "—";
	if (n === 0) return "0";
	if (n < 0.0001) return "<0.0001";
	return n.toLocaleString("en-US", {
		maximumFractionDigits: digits,
		minimumFractionDigits: 0,
	});
}

export default function LaunchPanel({ agentId, safeAddress, onLaunch, isLaunching = false }: Props) {
	const { balance, isLoading: balanceLoading, error: balanceError, refetch } = useSafeBalance(safeAddress);
	const xConnection = useXConnection(agentId);
	const xData = xConnection.status.data;
	const xConnected = Boolean(xData?.connected);

	const [firstBuy, setFirstBuy] = useState<string>("0");
	const [activePreset, setActivePreset] = useState<Preset | null>("zero");
	const [copied, setCopied] = useState(false);

	const parsed = useMemo(() => {
		const trimmed = firstBuy.trim();
		if (trimmed === "" || trimmed === ".") return { ok: false, value: 0 };
		const num = Number(trimmed);
		if (!Number.isFinite(num) || num < 0) return { ok: false, value: 0 };
		return { ok: true, value: num };
	}, [firstBuy]);

	const exceedsBalance = parsed.ok && balance != null && parsed.value > balance + 1e-12;
	const validationError = !parsed.ok
		? "Enter a valid non-negative amount"
		: exceedsBalance
			? "First buy can't exceed Safe balance"
			: null;

	const canLaunch = parsed.ok && !exceedsBalance && !isLaunching && Boolean(safeAddress);

	const setPreset = (preset: Preset) => {
		setActivePreset(preset);
		const fraction = PRESET_FRACTION[preset];
		if (balance == null) {
			if (preset === "zero") setFirstBuy("0");
			return;
		}
		// Leave some headroom for gas when going "all". Tax-splitter / four.meme
		// will still need a few thousand gwei; we ballpark 0.001 BNB.
		const target = preset === "all" ? Math.max(0, balance - 0.001) : balance * fraction;
		// Round to 4 decimals for display.
		const rounded = Math.round(target * 1e4) / 1e4;
		setFirstBuy(rounded.toString());
	};

	const onInputChange = (value: string) => {
		setFirstBuy(value);
		setActivePreset(null);
	};

	const handleCopy = async () => {
		if (!safeAddress) return;
		try {
			await navigator.clipboard.writeText(safeAddress);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard might be unavailable in non-secure contexts; fail silently.
		}
	};

	const handleSubmit = () => {
		if (!canLaunch) return;
		try {
			const wei = parseEther(parsed.value.toString());
			onLaunch?.(wei.toString());
		} catch {
			// parseEther can throw on truly malformed input; UI already validated.
		}
	};

	return (
		<section
			aria-label="Launch panel"
			className="relative rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C]"
		>
			<header className="px-6 md:px-8 pt-7 pb-5 border-b border-autofun-background-action-highlight/30">
				<div className="flex items-center justify-between gap-4 flex-wrap">
					<div>
						<p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Pre-launch</p>
						<h2 className="mt-1 text-xl text-white tracking-tight">Launch token</h2>
					</div>
					<div className="inline-flex items-center gap-2 text-xs text-neutral-500">
						<ShieldIcon className="w-3.5 h-3.5" />
						<span>Patron-only action</span>
					</div>
				</div>
			</header>

			<div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-autofun-background-action-highlight/30">
				{/* LEFT: Safe details */}
				<div className="px-6 md:px-8 py-7 space-y-6">
					<div>
						<h3 className="text-xs uppercase tracking-[0.16em] text-neutral-500 mb-3">Safe</h3>
						<div className="flex items-center gap-2">
							<code className="font-mono text-sm text-white truncate">{shortAddress(safeAddress)}</code>
							<button
								type="button"
								onClick={handleCopy}
								disabled={!safeAddress}
								aria-label="Copy Safe address"
								className={cn(
									"inline-flex items-center justify-center w-7 h-7 rounded-sm border transition-colors",
									"border-autofun-background-action-highlight/40 text-neutral-400 hover:text-white hover:bg-white/5",
									"disabled:opacity-40 disabled:cursor-not-allowed",
								)}
							>
								{copied ? <CheckIcon className="w-3.5 h-3.5 text-green-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
							</button>
							{safeAddress ? (
								<a
									href={`https://bscscan.com/address/${safeAddress}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-autofun-background-action-highlight/40 text-neutral-400 hover:text-white hover:bg-white/5"
									aria-label="View Safe on BscScan"
								>
									<ExternalLinkIcon className="w-3.5 h-3.5" />
								</a>
							) : null}
						</div>
					</div>

					<div>
						<h3 className="text-xs uppercase tracking-[0.16em] text-neutral-500 mb-2">Balance</h3>
						<div className="flex items-baseline gap-2">
							<div className="font-mono text-2xl text-white">{balanceLoading ? "…" : formatBnb(balance)}</div>
							<div className="text-xs uppercase tracking-wider text-neutral-500">BNB</div>
							<button
								type="button"
								onClick={() => refetch()}
								className="ml-2 text-[11px] text-neutral-500 hover:text-white underline-offset-4 hover:underline"
							>
								Refresh
							</button>
						</div>
						{balanceError ? (
							<p role="alert" className="text-[11px] text-red-300 mt-1">
								Couldn&apos;t read balance. {balanceError.message}
							</p>
						) : null}
					</div>

					<div>
						<h3 className="text-xs uppercase tracking-[0.16em] text-neutral-500 mb-2">X account</h3>
						{xConnection.status.isLoading ? (
							<div className="h-4 w-32 bg-[#141414] rounded animate-pulse" />
						) : xConnected ? (
							<p className="text-sm text-white">
								Connected{" "}
								<span className="text-neutral-400 font-mono">@{(xData?.xHandle ?? "").replace(/^@/, "")}</span>
							</p>
						) : (
							<p className="text-sm text-amber-300">Not connected</p>
						)}
					</div>
				</div>

				{/* RIGHT: First buy */}
				<div className="px-6 md:px-8 py-7 space-y-5">
					<div className="flex items-center justify-between gap-4 flex-wrap">
						<label htmlFor="first-buy" className="text-xs uppercase tracking-[0.16em] text-neutral-500">
							First buy (BNB)
						</label>
						{balance != null && parsed.ok && parsed.value > 0 ? (
							<span className="text-[11px] font-mono text-neutral-500">{formatBnb(parsed.value, 6)} BNB</span>
						) : null}
					</div>

					<div className="relative">
						<input
							id="first-buy"
							type="text"
							inputMode="decimal"
							pattern="[0-9]*\.?[0-9]*"
							value={firstBuy}
							onChange={(e) => onInputChange(e.target.value.replace(/[^0-9.]/g, ""))}
							aria-invalid={validationError ? "true" : "false"}
							aria-describedby={validationError ? "first-buy-error" : "first-buy-help"}
							className={cn(
								"w-full px-4 py-3 rounded-sm bg-[#0A0A0A] border text-white font-mono text-lg",
								"focus:outline-none focus:ring-1 transition-colors",
								validationError
									? "border-red-500/50 focus:border-red-400 focus:ring-red-400/30"
									: "border-autofun-background-action-highlight/40 focus:border-green-500/60 focus:ring-green-500/30",
							)}
							placeholder="0"
						/>
						<span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs uppercase tracking-wider text-neutral-500 font-mono">
							BNB
						</span>
					</div>

					<div className="flex flex-wrap gap-2">
						{PRESET_ORDER.map((preset) => {
							const active = activePreset === preset;
							return (
								<button
									key={preset}
									type="button"
									onClick={() => setPreset(preset)}
									aria-pressed={active}
									className={cn(
										"inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
										active
											? "border-green-500/40 bg-green-500/10 text-green-300"
											: "border-autofun-background-action-highlight/40 text-neutral-400 hover:text-white hover:bg-white/5",
									)}
								>
									{PRESET_LABELS[preset]}
								</button>
							);
						})}
					</div>

					<p id="first-buy-help" className="text-xs text-neutral-500 leading-relaxed max-w-[42ch]">
						Optional. Defaults 0. The agent&apos;s Safe will buy this many BNB worth of its own token at launch.
					</p>

					{validationError ? (
						<p id="first-buy-error" role="alert" className="text-xs text-red-300">
							{validationError}
						</p>
					) : null}
				</div>
			</div>

			<div className="px-6 md:px-8 py-6 border-t border-autofun-background-action-highlight/30">
				<Button
					type="button"
					onClick={handleSubmit}
					disabled={!canLaunch}
					aria-label="Launch token"
					className={cn(
						"w-full h-12 text-sm font-semibold uppercase tracking-[0.14em]",
						"bg-green-500 text-black hover:bg-green-400 hover:text-black",
						"disabled:bg-green-500/30 disabled:text-black/60",
					)}
				>
					{isLaunching ? (
						<>
							<Spinner className="w-4 h-4 mr-2" />
							Authorizing…
						</>
					) : (
						"Launch token"
					)}
				</Button>
				<p className="text-[11px] text-neutral-500 mt-3 text-center max-w-[60ch] mx-auto">
					You&apos;ll sign a SIWE message. The Safe will then submit a four.meme creation transaction with this
					first-buy amount.
				</p>
			</div>
		</section>
	);
}
