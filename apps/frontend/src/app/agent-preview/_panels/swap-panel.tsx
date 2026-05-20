/**
 * <SwapPanel>
 *
 * Wave T worker B. Visual swap widget. No wallet plumbing tonight,
 * just the structural pixel-close interface. "You pay" + "You receive"
 * panels split by an arrow divider, then a large Connect Wallet CTA.
 *
 * Token selectors are bespoke buttons (not full <Select>) since we only
 * surface two assets right now (BNB and $WAIFU) and Radix Select would
 * over-engineer the visual.
 */

"use client";

import { ArrowDownUp, ChevronDown, RefreshCw, Settings } from "lucide-react";
import { useState } from "react";

import type { TokenMetrics } from "../lib/token";
import { Label, Panel } from "./_primitives";

type SwapPanelProps = {
	token: TokenMetrics;
};

type Side = "pay" | "receive";

type TokenSlot = {
	symbol: string;
	logo: React.ReactNode;
};

function BnbBadge() {
	return (
		<span
			aria-hidden
			className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] font-bold text-black"
			style={{ background: "#f3ba2f" }}
		>
			B
		</span>
	);
}

function AgentBadge({ symbol }: { symbol: string }) {
	const letter = symbol[0] ?? "W";
	return (
		<span
			aria-hidden
			className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] font-bold"
			style={{ background: "var(--accent)", color: "#000" }}
		>
			{letter}
		</span>
	);
}

export function SwapPanel({ token }: SwapPanelProps) {
	// Direction: pay BNB receive $WAIFU is the default ("buy"). Swapped on flip.
	const [flipped, setFlipped] = useState(false);
	const [payAmount, setPayAmount] = useState("0.0");
	const [receiveAmount, setReceiveAmount] = useState("0.0");

	const bnbSlot: TokenSlot = { symbol: "BNB", logo: <BnbBadge /> };
	const agentSlot: TokenSlot = { symbol: token.symbol, logo: <AgentBadge symbol={token.symbol} /> };

	const paySlot = flipped ? agentSlot : bnbSlot;
	const receiveSlot = flipped ? bnbSlot : agentSlot;

	function flip() {
		setFlipped((f) => !f);
		setPayAmount(receiveAmount);
		setReceiveAmount(payAmount);
	}

	return (
		<Panel className="flex flex-col gap-3">
			<Label
				right={
					<div className="flex items-center gap-1.5">
						<button
							aria-label="Swap settings"
							className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-secondary)]"
							type="button"
						>
							<Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
						<button
							aria-label="Refresh quote"
							className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-secondary)]"
							type="button"
						>
							<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</div>
				}
			>
				Swap ${token.symbol}
			</Label>

			{/* ── You pay ─────────────────────────────────────────────── */}
			<SwapSlot amount={payAmount} balance="-" onAmount={setPayAmount} side="pay" slot={paySlot} />

			{/* ── Flip divider ────────────────────────────────────────── */}
			<div className="relative flex items-center justify-center" style={{ marginTop: -10, marginBottom: -10 }}>
				<button
					aria-label="Flip swap direction"
					className="z-10 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel-hi)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
					onClick={flip}
					type="button"
				>
					<ArrowDownUp className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>

			{/* ── You receive ─────────────────────────────────────────── */}
			<SwapSlot amount={receiveAmount} balance="-" onAmount={setReceiveAmount} side="receive" slot={receiveSlot} />

			{/* ── CTA ─────────────────────────────────────────────────── */}
			<button
				className="mt-1 flex h-[44px] w-full items-center justify-center rounded-md font-mono text-[12px] uppercase tracking-[0.22em] text-black transition-transform active:scale-[0.99]"
				style={{ background: "var(--accent)" }}
				type="button"
			>
				Connect Wallet
			</button>

			<div className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				routes via pancakeswap · launched on FLAP
			</div>
		</Panel>
	);
}

function SwapSlot({
	amount,
	balance,
	onAmount,
	side,
	slot,
}: {
	amount: string;
	balance: string;
	onAmount: (next: string) => void;
	side: Side;
	slot: TokenSlot;
}) {
	return (
		<div className="rounded-md border border-[var(--border-soft)] bg-white/[0.015] px-3.5 py-3 transition-colors focus-within:border-[var(--border-mid)]">
			<div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span>{side === "pay" ? "You pay" : "You receive"}</span>
				<span>
					Balance: <span className="text-[var(--text-secondary)]">{balance}</span>
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<button
					className="flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-white/[0.025] py-1.5 pl-1.5 pr-2 transition-colors hover:border-[var(--border-mid)] hover:bg-white/[0.04]"
					type="button"
				>
					{slot.logo}
					<span className="font-mono text-[12px] text-[var(--text-primary)]">{slot.symbol}</span>
					<ChevronDown className="h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={1.5} />
				</button>
				<input
					aria-label={side === "pay" ? "Pay amount" : "Receive amount"}
					className="w-full bg-transparent text-right font-mono text-[22px] tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
					inputMode="decimal"
					onChange={(e) => onAmount(e.target.value)}
					placeholder="0.0"
					value={amount}
				/>
			</div>
		</div>
	);
}
