"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { parseEther } from "viem";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Shield } from "lucide-react";
import useBalance from "@/hooks/use-balance";
import { useXConnection } from "@/lib/api/x-connection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
	agentId: string;
	safeAddress: string | null | undefined;
	onLaunch?: (firstBuyWei: string) => void;
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
	const xLoading = xConnection.status.isLoading;

	const [firstBuy, setFirstBuy] = useState<string>("0");
	const [activePreset, setActivePreset] = useState<Preset | null>("zero");
	const [copied, setCopied] = useState(false);

	const launchSentinelRef = useRef<HTMLDivElement | null>(null);
	const [stickyVisible, setStickyVisible] = useState(false);

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

	// Empty Safe state — balance read succeeded and equals 0.
	const isEmptySafe = !balanceLoading && balanceError == null && balance != null && balance === 0;

	const canLaunch = parsed.ok && !exceedsBalance && !isLaunching && Boolean(safeAddress) && !isEmptySafe;

	const setPreset = (preset: Preset) => {
		setActivePreset(preset);
		const fraction = PRESET_FRACTION[preset];
		if (balance == null) {
			if (preset === "zero") setFirstBuy("0");
			return;
		}
		// Leave headroom for gas when going "all".
		const target = preset === "all" ? Math.max(0, balance - 0.001) : balance * fraction;
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
			// non-secure context — silent
		}
	};

	const handleSubmit = () => {
		if (!canLaunch) return;
		try {
			const wei = parseEther(parsed.value.toString());
			onLaunch?.(wei.toString());
		} catch {
			// validated upstream
		}
	};

	// Show the mobile sticky launch button when the in-card button leaves
	// the viewport. IntersectionObserver — no scroll listeners.
	useEffect(() => {
		const el = launchSentinelRef.current;
		if (!el || typeof IntersectionObserver === "undefined") return;
		const io = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry) return;
				setStickyVisible(!entry.isIntersecting);
			},
			{ threshold: 0.01, rootMargin: "0px 0px -40px 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	// Empty Safe — render a focused funding state instead of the form.
	if (isEmptySafe) {
		return (
			<section aria-label="Fund Safe" className="relative rounded-sm border border-stroke-strong bg-[#0C0C0C]">
				<div className="px-6 md:px-8 py-12 space-y-6">
					<div className="flex items-start gap-3">
						<div className="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] text-[#a1a1aa]">
							<AlertTriangle className="w-4 h-4" />
						</div>
						<div>
							<h2 className="text-xl text-white tracking-tight">fund the safe first.</h2>
							<p className="text-sm text-neutral-400 mt-2 max-w-[60ch] leading-relaxed">
								your agent&apos;s safe holds 0 BNB. send BNB to the address below so the safe can pay gas and
								(optionally) take a first buy.
							</p>
						</div>
					</div>

					<div className="rounded-sm border border-stroke bg-[#0A0A0A] p-4 flex items-center gap-3 flex-wrap">
						<code className="font-mono text-sm text-white break-all flex-1 min-w-0">{safeAddress ?? "—"}</code>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleCopy}
								disabled={!safeAddress}
								aria-label="Copy Safe address"
								className="inline-flex items-center gap-2 px-3 h-8 rounded-sm border border-stroke text-neutral-300 hover:text-white hover:bg-white/5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
								{copied ? "Copied" : "Copy"}
							</button>
							{safeAddress ? (
								<a
									href={`https://bscscan.com/address/${safeAddress}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-stroke text-neutral-400 hover:text-white hover:bg-white/5"
									aria-label="View Safe on BscScan"
								>
									<ExternalLink className="w-3.5 h-3.5" />
								</a>
							) : null}
						</div>
					</div>

					<div className="flex items-center gap-3 flex-wrap">
						<Button type="button" onClick={() => refetch()} className="h-10 bg-white text-black hover:bg-white/90">
							i funded it. refresh.
						</Button>
						<p className="text-[11px] text-neutral-500">balance refreshes every 60 seconds automatically.</p>
					</div>
				</div>
			</section>
		);
	}

	return (
		<>
			<section aria-label="Launch panel" className="relative rounded-sm border border-stroke bg-[#0C0C0C]">
				<header className="px-6 md:px-8 pt-7 pb-5 border-b border-stroke">
					<div className="flex items-center justify-between gap-4 flex-wrap">
						<div>
							<p className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-500">[pre-launch]</p>
							<h2 className="mt-1 text-xl text-white tracking-tight">launch the token.</h2>
						</div>
						<div className="inline-flex items-center gap-2 text-xs text-neutral-500">
							<Shield className="w-3.5 h-3.5" />
							<span>patron-only.</span>
						</div>
					</div>
				</header>

				{!xLoading && !xConnected ? (
					<div className="px-6 md:px-8 py-3 border-b border-stroke-strong bg-white/[0.02] flex items-start gap-3">
						<AlertTriangle className="w-4 h-4 mt-0.5 text-[#a1a1aa] shrink-0" />
						<p className="text-xs text-[#a1a1aa] leading-relaxed">
							x not connected. your agent will launch silently.{" "}
							<Link href={`/patron/${agentId}#x-account`} className="underline-offset-4 hover:underline text-white">
								connect now.
							</Link>
						</p>
					</div>
				) : null}

				<div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stroke">
					{/* LEFT: Safe details */}
					<div className="px-6 md:px-8 py-7 space-y-6">
						<div>
							<h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">safe</h3>
							<div className="flex items-center gap-2">
								<code className="font-mono text-sm text-white truncate">{shortAddress(safeAddress)}</code>
								<button
									type="button"
									onClick={handleCopy}
									disabled={!safeAddress}
									aria-label="Copy Safe address"
									className={cn(
										"inline-flex items-center justify-center w-7 h-7 rounded-sm border transition-colors",
										"border-stroke text-neutral-400 hover:text-white hover:bg-white/5",
										"disabled:opacity-40 disabled:cursor-not-allowed",
									)}
								>
									{copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
								</button>
								{safeAddress ? (
									<a
										href={`https://bscscan.com/address/${safeAddress}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-stroke text-neutral-400 hover:text-white hover:bg-white/5"
										aria-label="View Safe on BscScan"
									>
										<ExternalLink className="w-3.5 h-3.5" />
									</a>
								) : null}
							</div>
						</div>

						<div>
							<h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-2">balance</h3>
							<div className="flex items-baseline gap-2">
								<div className="font-mono text-2xl text-white">{balanceLoading ? "…" : formatBnb(balance)}</div>
								<div className="text-xs uppercase tracking-[0.2em] text-neutral-500">BNB</div>
								<button
									type="button"
									onClick={() => refetch()}
									className="ml-2 text-[11px] text-neutral-500 hover:text-white underline-offset-4 hover:underline"
								>
									refresh
								</button>
							</div>
							{balanceError ? (
								<p role="alert" className="text-[11px] text-red-300 mt-1">
									Couldn&apos;t read balance. {balanceError.message}
								</p>
							) : null}
						</div>

						<div>
							<h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-2">x account</h3>
							{xLoading ? (
								<div className="h-4 w-32 bg-[#141414] rounded animate-pulse" />
							) : xConnected ? (
								<p className="text-sm text-white">
									connected{" "}
									<span className="text-neutral-400 font-mono">@{(xData?.xHandle ?? "").replace(/^@/, "")}</span>
								</p>
							) : (
								<p className="text-sm text-[#a1a1aa]">not connected</p>
							)}
						</div>
					</div>

					{/* RIGHT: First buy */}
					<div className="px-6 md:px-8 py-7 space-y-5">
						<div className="flex items-center justify-between gap-4 flex-wrap">
							<label htmlFor="first-buy" className="text-xs uppercase tracking-[0.2em] text-neutral-500">
								first buy (BNB)
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
										: "border-stroke focus:border-accent/60 focus:ring-accent/30",
								)}
								placeholder="0"
							/>
							<span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono">
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
												? "border-accent/40 bg-accent/10 text-accent"
												: "border-stroke text-neutral-400 hover:text-white hover:bg-white/5",
										)}
									>
										{PRESET_LABELS[preset]}
									</button>
								);
							})}
						</div>

						<p id="first-buy-help" className="text-xs text-neutral-500 leading-relaxed max-w-[42ch]">
							optional. defaults 0. the agent&apos;s safe will buy this many BNB of its own token at launch.
						</p>

						{validationError ? (
							<p id="first-buy-error" role="alert" className="text-xs text-red-300">
								{validationError}
							</p>
						) : null}
					</div>
				</div>

				<div ref={launchSentinelRef} className="px-6 md:px-8 py-6 border-t border-stroke">
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={!canLaunch}
						aria-label="launch token"
						className={cn(
							"w-full h-12 text-sm font-semibold uppercase tracking-[0.18em]",
							"bg-accent text-black hover:bg-accent-dim hover:text-black",
							"disabled:bg-accent/30 disabled:text-black/60",
						)}
					>
						{isLaunching ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								authorizing…
							</>
						) : (
							"launch token"
						)}
					</Button>
					<p className="text-[11px] text-neutral-500 mt-3 text-center max-w-[60ch] mx-auto">
						you sign. the safe submits to four.meme. token lands on the curve.
					</p>
				</div>
			</section>

			{/* Mobile sticky launch button — appears when the in-card button is off-screen. */}
			<div
				aria-hidden={!stickyVisible}
				className={cn(
					"md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-3",
					"bg-gradient-to-t from-black via-black/95 to-black/0",
					"transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]", // EASE_OUT_EXPO (matches lib/motion)
					stickyVisible
						? "translate-y-0 opacity-100 pointer-events-auto"
						: "translate-y-4 opacity-0 pointer-events-none",
				)}
			>
				<Button
					type="button"
					onClick={handleSubmit}
					disabled={!canLaunch}
					aria-label="launch token"
					tabIndex={stickyVisible ? 0 : -1}
					className={cn(
						"w-full h-12 text-sm font-semibold uppercase tracking-[0.18em]",
						"bg-accent text-black hover:bg-accent-dim hover:text-black",
						"disabled:bg-accent/30 disabled:text-black/60",
					)}
				>
					{isLaunching ? (
						<>
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
							authorizing…
						</>
					) : (
						"launch token"
					)}
				</Button>
			</div>
		</>
	);
}
