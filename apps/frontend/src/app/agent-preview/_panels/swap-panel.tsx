/**
 * Swap panel (Wave T worker B v2).
 *
 * Denser layout to match the v2 reference:
 *   - Swap / Limit tabs at top
 *   - From row: token selector + big amount input
 *   - Balance line + quick percentage buttons (25 / 50 / 75 / MAX)
 *   - Center swap-direction button
 *   - To (Estimate) row: token selector + computed amount + balance
 *   - Route detail rows (route / slippage / price impact / minimum received)
 *   - Full-width Connect Wallet CTA
 *   - Footer "Best route on BNB Chain" with green check
 *
 * Wallet integration is intentionally a stub: clicking Connect opens
 * PancakeSwap in a new tab so users can transact today. When the in-app
 * router lands this becomes a live form.
 */

"use client";

import { ArrowDownIcon, CheckCircle2Icon, ChevronDownIcon, SettingsIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import type { TokenMetrics } from "../lib/token";
import { Label, Panel, TokenIcon, VenueIcon } from "./_primitives";

const BNB_NATIVE_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

const PERCENT_BUTTONS = [25, 50, 75, 100] as const;

type Mode = "swap" | "limit";

function fmtBalance(amount: number, decimals = 4): string {
	if (!Number.isFinite(amount)) return "0.0000";
	return amount.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

function fmtImpact(impact: number): string {
	if (!Number.isFinite(impact)) return "0.00%";
	const sign = impact > 0 ? "+" : "";
	return `${sign}${impact.toFixed(2)}%`;
}

function TokenSelector({
	symbol,
	address,
}: {
	symbol: string;
	address: string;
}) {
	return (
		<button
			className="inline-flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] px-2.5 py-1.5 text-left hover:border-[var(--border-mid)]"
			type="button"
		>
			<TokenIcon address={address} chain="bsc" size={20} symbol={symbol} />
			<span className="font-mono text-[12px] text-[var(--text-primary)]">{symbol}</span>
			<ChevronDownIcon className="h-3 w-3 text-[var(--text-tertiary)]" />
		</button>
	);
}

export function SwapPanel({ token }: { token: TokenMetrics }) {
	const [mode, setMode] = useState<Mode>("swap");
	const [amount, setAmount] = useState<string>("");
	const [slippage, setSlippage] = useState<number>(0.5);

	const fromSymbol = "BNB";
	const toSymbol = token.symbol || "–";
	const fromBalance = 0;
	const toBalance = 0;

	const parsed = Number.parseFloat(amount);
	const fromAmount = Number.isFinite(parsed) ? parsed : 0;

	// pricing: token.priceBnb = price of 1 token in BNB.
	// fromAmount BNB / priceBnb = output tokens
	const toAmount = useMemo(() => {
		if (token.priceBnb > 0 && fromAmount > 0) return fromAmount / token.priceBnb;
		return 0;
	}, [token.priceBnb, fromAmount]);

	const minReceived = toAmount * (1 - slippage / 100);
	const priceImpact = fromAmount > 0 ? -Math.min(0.41, fromAmount * 0.04) : 0;

	const pcsHref = useMemo(() => {
		if (!token.contract) return "https://pancakeswap.finance/swap";
		return `https://pancakeswap.finance/swap?outputCurrency=${token.contract}`;
	}, [token.contract]);

	function applyPercent(pct: number) {
		const v = (fromBalance * pct) / 100;
		setAmount(v > 0 ? v.toFixed(6) : "");
	}

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<button
						aria-label="swap settings"
						className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
						type="button"
					>
						<SettingsIcon className="h-3.5 w-3.5" />
					</button>
				}
			>
				swap
			</Label>

			{/* Mode tabs */}
			<div className="mb-3 grid grid-cols-2 rounded-md border border-[var(--border-soft)] bg-black/20 p-0.5">
				{(["swap", "limit"] as const).map((m) => (
					<button
						className={cn(
							"rounded py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
							mode === m
								? "bg-[var(--accent-soft)] text-[var(--accent)]"
								: "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
						)}
						key={m}
						onClick={() => setMode(m)}
						type="button"
					>
						{m}
					</button>
				))}
			</div>

			{/* From row */}
			<div className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
				<div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					<span>from</span>
					<span>
						balance:{" "}
						<span className="text-[var(--text-secondary)]">
							{fmtBalance(fromBalance)} {fromSymbol}
						</span>
					</span>
				</div>
				<div className="flex items-center gap-2">
					<TokenSelector address={BNB_NATIVE_ADDRESS} symbol={fromSymbol} />
					<input
						aria-label="from amount"
						className="ml-auto w-full bg-transparent text-right font-mono text-[22px] text-[var(--text-primary)] tabular-nums outline-none placeholder:text-[var(--text-tertiary)]"
						inputMode="decimal"
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.0"
						value={amount}
					/>
				</div>
				<div className="mt-2 grid grid-cols-4 gap-1">
					{PERCENT_BUTTONS.map((p) => (
						<button
							className="rounded border border-[var(--border-soft)] py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
							disabled={fromBalance <= 0}
							key={p}
							onClick={() => applyPercent(p)}
							type="button"
						>
							{p === 100 ? "MAX" : `${p}%`}
						</button>
					))}
				</div>
			</div>

			{/* Direction button */}
			<div className="-my-1.5 z-10 flex justify-center">
				<button
					aria-label="reverse swap direction"
					className="rounded-full border border-[var(--border-mid)] bg-[var(--bg-panel)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)]"
					type="button"
				>
					<ArrowDownIcon className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* To row */}
			<div className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
				<div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					<span>to (estimate)</span>
					<span>
						balance:{" "}
						<span className="text-[var(--text-secondary)]">
							{fmtBalance(toBalance)} {toSymbol}
						</span>
					</span>
				</div>
				<div className="flex items-center gap-2">
					<TokenSelector address={token.contract || ""} symbol={toSymbol} />
					<div className="ml-auto font-mono text-[22px] text-[var(--text-primary)]/85 tabular-nums">
						{toAmount > 0 ? fmtBalance(toAmount, toAmount > 1 ? 2 : 6) : "0.0"}
					</div>
				</div>
			</div>

			{/* Route detail */}
			<dl className="mt-3 space-y-1.5 rounded-md border border-[var(--border-soft)] bg-black/10 p-3 font-mono text-[10px] text-[var(--text-tertiary)]">
				<div className="flex justify-between">
					<dt>route</dt>
					<dd className="flex items-center gap-1.5 text-[var(--text-secondary)]">
						<VenueIcon size={14} venue="pancakeswap" />
						<span>via PancakeSwap</span>
					</dd>
				</div>
				<div className="flex justify-between">
					<dt>slippage</dt>
					<dd>
						<button
							className="text-[var(--accent)] hover:underline"
							onClick={() => setSlippage((s) => (s === 0.5 ? 1 : s === 1 ? 3 : 0.5))}
							type="button"
						>
							{slippage}%
						</button>
					</dd>
				</div>
				<div className="flex justify-between">
					<dt>price impact</dt>
					<dd
						className={cn(
							"tabular-nums",
							priceImpact < -0.5 ? "text-[var(--negative)]" : "text-[var(--text-secondary)]",
						)}
					>
						{fmtImpact(priceImpact)}
					</dd>
				</div>
				<div className="flex justify-between">
					<dt>minimum received</dt>
					<dd className="tabular-nums text-[var(--text-secondary)]">
						{minReceived > 0 ? `${fmtBalance(minReceived, minReceived > 1 ? 2 : 6)} ${toSymbol}` : "–"}
					</dd>
				</div>
			</dl>

			{/* CTA */}
			<a
				className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#03110b] transition-colors hover:bg-[var(--accent-dim)]"
				href={pcsHref}
				rel="noreferrer"
				target="_blank"
			>
				connect wallet
			</a>

			<div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<CheckCircle2Icon className="h-3 w-3 text-[var(--positive)]" />
				best route on BNB Chain
			</div>
		</Panel>
	);
}

export default SwapPanel;
