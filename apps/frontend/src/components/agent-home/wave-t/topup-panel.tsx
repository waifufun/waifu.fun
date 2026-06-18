/**
 * Patron top-up widget (Phase 2 Li.Fi MVP).
 *
 * Lets a holder of $TOKEN fund the agent's on-chain Safe with any major
 * source token on any major EVM chain. Quotes are proxied through the
 * waifu.fun API which enforces the bridge allowlist, the 0.5% slippage
 * cap, and the 0% integrator fee. The patron signs the returned
 * transaction with their own wallet, no Steward involvement.
 *
 * UI conventions follow `.impeccable.md` Wave T grammar:
 *   - `<Panel>` container, mono numbers, lowercase copy, single accent
 *   - Honest empty states ("no wallet connected", "no route found")
 *   - No em-dashes, no fake precision, no neon glows
 *
 * The destination address is resolved server-side from the
 * `agent_wallet_registry` table; the client never names the recipient.
 * That keeps the recipient pinned to a curated wallet we control.
 */

"use client";

import { ArrowRightIcon, CheckCircle2Icon, ChevronDownIcon, ExternalLinkIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";

import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { cn } from "@/lib/utils";

import { Label, Panel, Pulse } from "./_primitives";

interface TopUpPanelProps {
	agentTokenAddress: string;
	agentTicker: string;
	/**
	 * Source chain to preselect. Defaults to Base. Pass 56 to default to
	 * BNB Chain (the on-chain funding path Shadow wants as the default).
	 */
	defaultChainId?: number;
}

interface ChainPreset {
	id: number;
	key: string;
	label: string;
	explorer: string;
	tokens: TokenPreset[];
}

interface TokenPreset {
	symbol: string;
	address: string;
	decimals: number;
	native?: boolean;
}

// Native-asset sentinel per Li.Fi convention.
const NATIVE = "0x0000000000000000000000000000000000000000";

const CHAIN_PRESETS: ChainPreset[] = [
	{
		id: 8_453,
		key: "base",
		label: "Base",
		explorer: "https://basescan.org/tx/",
		tokens: [
			{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
			{ symbol: "ETH", address: NATIVE, decimals: 18, native: true },
		],
	},
	{
		id: 56,
		key: "bsc",
		label: "BNB Chain",
		explorer: "https://bscscan.com/tx/",
		tokens: [
			{ symbol: "BNB", address: NATIVE, decimals: 18, native: true },
			{ symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
		],
	},
	{
		id: 42_161,
		key: "arb",
		label: "Arbitrum",
		explorer: "https://arbiscan.io/tx/",
		tokens: [
			{ symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
			{ symbol: "ETH", address: NATIVE, decimals: 18, native: true },
		],
	},
	{
		id: 10,
		key: "op",
		label: "Optimism",
		explorer: "https://optimistic.etherscan.io/tx/",
		tokens: [
			{ symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
			{ symbol: "ETH", address: NATIVE, decimals: 18, native: true },
		],
	},
	{
		id: 137,
		key: "polygon",
		label: "Polygon",
		explorer: "https://polygonscan.com/tx/",
		tokens: [
			{ symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
			{ symbol: "POL", address: NATIVE, decimals: 18, native: true },
		],
	},
	{
		id: 1,
		key: "eth",
		label: "Ethereum",
		explorer: "https://etherscan.io/tx/",
		tokens: [
			{ symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
			{ symbol: "ETH", address: NATIVE, decimals: 18, native: true },
		],
	},
];

interface ShapedQuote {
	bridge: string;
	bridgeLabel: string;
	estimatedTime: number;
	feeUsd: number | null;
	gasUsd: number | null;
	fromAmount: string;
	fromAmountUsd: number | null;
	toAmount: string;
	toAmountMin: string;
	toAmountUsd: number | null;
	approvalAddress: string | null;
	txData: {
		to: string;
		from: string | null;
		value: string | null;
		data: string;
		chainId: number;
		gasLimit: string | null;
	} | null;
}

interface QuoteResponse {
	ok: true;
	data: {
		agentTokenAddress: string;
		destination: { address: string; chain: string; chainId: number; token: string };
		quote: ShapedQuote;
		integrator: { name: string; feeBps: number; slippageBps: number };
		cached: boolean;
	};
}

interface QuoteError {
	ok: false;
	error: string;
	message: string;
}

type QuoteResult = QuoteResponse | QuoteError;

type FlightState =
	| { kind: "idle" }
	| { kind: "submitted"; txHash: string; quote: ShapedQuote }
	| { kind: "pending"; txHash: string; quote: ShapedQuote }
	| { kind: "completed"; txHash: string; quote: ShapedQuote; explorerLink: string | null }
	| { kind: "partial"; txHash: string; quote: ShapedQuote }
	| { kind: "refunded"; txHash: string; quote: ShapedQuote }
	| { kind: "failed"; txHash?: string; message: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "";

function apiUrl(path: string): string {
	if (!API_BASE) return path;
	if (API_BASE.endsWith("/") && path.startsWith("/")) return `${API_BASE.slice(0, -1)}${path}`;
	return `${API_BASE}${path}`;
}

function fmtUsd(value: number | null | undefined, fallback = "·"): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
	if (value < 0.01 && value > 0) return "<$0.01";
	if (value < 1) return `$${value.toFixed(3)}`;
	if (value < 100) return `$${value.toFixed(2)}`;
	return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtSeconds(s: number): string {
	if (!Number.isFinite(s) || s <= 0) return "·";
	if (s < 60) return `${Math.round(s)}s`;
	if (s < 3_600) return `${Math.round(s / 60)}m`;
	return `${(s / 3_600).toFixed(1)}h`;
}

function fmtTokenAmount(raw: string, decimals: number): string {
	try {
		const v = formatUnits(BigInt(raw), decimals);
		const n = Number.parseFloat(v);
		if (!Number.isFinite(n)) return v;
		if (n === 0) return "0";
		if (n < 0.0001) return v;
		if (n < 1) return n.toFixed(4);
		if (n < 1_000) return n.toFixed(2);
		return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
	} catch {
		return raw;
	}
}

function ChainSelector({
	value,
	onChange,
	disabled,
}: {
	value: ChainPreset;
	onChange: (next: ChainPreset) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<button
				className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] px-2.5 py-1.5 text-left disabled:opacity-50 hover:border-[var(--border-mid)]"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-primary)]">
					{value.label}
				</span>
				<ChevronDownIcon className="h-3 w-3 text-[var(--text-tertiary)]" />
			</button>
			{open ? (
				<div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel-hi)] p-1 shadow-lg">
					{CHAIN_PRESETS.map((c) => (
						<button
							className={cn(
								"flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-white/[0.04]",
								c.id === value.id ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
							)}
							key={c.id}
							onClick={() => {
								onChange(c);
								setOpen(false);
							}}
							type="button"
						>
							{c.label}
							<span className="text-[9px] text-[var(--text-tertiary)]">id {c.id}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function TokenSelector({
	chain,
	value,
	onChange,
	disabled,
}: {
	chain: ChainPreset;
	value: TokenPreset;
	onChange: (next: TokenPreset) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<button
				className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] px-2.5 py-1.5 text-left disabled:opacity-50 hover:border-[var(--border-mid)]"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<span className="font-mono text-[12px] text-[var(--text-primary)]">{value.symbol}</span>
				<ChevronDownIcon className="h-3 w-3 text-[var(--text-tertiary)]" />
			</button>
			{open ? (
				<div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel-hi)] p-1 shadow-lg">
					{chain.tokens.map((t) => (
						<button
							className={cn(
								"flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-mono text-[12px] hover:bg-white/[0.04]",
								t.symbol === value.symbol ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
							)}
							key={t.symbol}
							onClick={() => {
								onChange(t);
								setOpen(false);
							}}
							type="button"
						>
							{t.symbol}
							<span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
								{t.native ? "native" : "erc20"}
							</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function TopUpPanel({ agentTokenAddress, agentTicker, defaultChainId }: TopUpPanelProps) {
	const { address, isConnected, chainId } = useAccount();
	const { switchChainAsync } = useSwitchChain();
	const { sendTransactionAsync, isPending: signing } = useSendTransaction();

	const initialChain = useMemo(
		() => CHAIN_PRESETS.find((c) => c.id === defaultChainId) ?? CHAIN_PRESETS[0]!,
		[defaultChainId],
	);
	const [chain, setChain] = useState<ChainPreset>(() => initialChain);
	const [token, setToken] = useState<TokenPreset>(() => initialChain.tokens[0]!);
	const [amount, setAmount] = useState<string>("");
	const [quote, setQuote] = useState<QuoteResult | null>(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [flight, setFlight] = useState<FlightState>({ kind: "idle" });
	const quoteSeq = useRef(0);

	useEffect(() => {
		setToken(chain.tokens[0]!);
		setQuote(null);
	}, [chain]);

	useEffect(() => {
		if (!address) {
			setQuote(null);
			return;
		}
		const parsed = Number.parseFloat(amount);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setQuote(null);
			return;
		}
		let cancelled = false;
		const handle = window.setTimeout(async () => {
			const seq = ++quoteSeq.current;
			setQuoteLoading(true);
			try {
				const raw = parseUnits(amount, token.decimals);
				const qs = new URLSearchParams({
					fromChain: String(chain.id),
					fromToken: token.address,
					amount: raw.toString(),
					fromAddress: address,
				});
				const res = await fetch(apiUrl(`/v2/agents/${agentTokenAddress}/topup/quote?${qs.toString()}`), {
					credentials: "include",
				});
				const json = (await res.json()) as QuoteResult;
				if (cancelled || seq !== quoteSeq.current) return;
				setQuote(json);
			} catch (err) {
				if (cancelled) return;
				setQuote({
					ok: false,
					error: "NETWORK_ERROR",
					message: err instanceof Error ? err.message : "network error",
				});
			} finally {
				if (!cancelled && seq === quoteSeq.current) setQuoteLoading(false);
			}
		}, 350);
		return () => {
			cancelled = true;
			window.clearTimeout(handle);
		};
	}, [address, agentTokenAddress, amount, chain.id, token.address, token.decimals]);

	useEffect(() => {
		if (flight.kind !== "submitted" && flight.kind !== "pending") return;
		let alive = true;
		let attempt = 0;
		const poll = async () => {
			attempt += 1;
			try {
				const res = await fetch(apiUrl(`/v2/agents/${agentTokenAddress}/topup/status`), {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						txHash: flight.txHash,
						fromChain: chain.id,
						fromAddress: address,
						bridge: quote?.ok ? quote.data.quote.bridge : undefined,
					}),
				});
				if (!alive) return;
				const json = (await res.json()) as {
					ok: boolean;
					data?: { status: string; explorerLink?: string | null };
				};
				if (json.ok && json.data) {
					const next = mapStatusToFlight(json.data, flight);
					if (next) setFlight(next);
					if (
						next?.kind === "completed" ||
						next?.kind === "partial" ||
						next?.kind === "refunded" ||
						next?.kind === "failed"
					) {
						return;
					}
				}
			} catch {
				// Soft-fail polling; keep retrying within budget.
			}
			if (!alive) return;
			const delay = attempt <= 6 ? 10_000 : attempt <= 12 ? 30_000 : 60_000;
			window.setTimeout(poll, delay);
		};
		const id = window.setTimeout(poll, 6_000);
		return () => {
			alive = false;
			window.clearTimeout(id);
		};
	}, [flight, agentTokenAddress, address, chain.id, quote]);

	const onSubmit = useCallback(async () => {
		if (!quote || !quote.ok) return;
		if (!address) return;
		const tx = quote.data.quote.txData;
		if (!tx) {
			setFlight({ kind: "failed", message: "no transaction calldata returned. refresh and retry." });
			return;
		}
		try {
			if (chainId !== chain.id) {
				await switchChainAsync({ chainId: chain.id });
			}
			const hash = await sendTransactionAsync({
				to: tx.to as `0x${string}`,
				data: tx.data as `0x${string}`,
				value: tx.value ? BigInt(tx.value) : 0n,
				chainId: chain.id,
				...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
			});
			setFlight({ kind: "submitted", txHash: hash, quote: quote.data.quote });
		} catch (err) {
			setFlight({ kind: "failed", message: err instanceof Error ? err.message : "transaction failed" });
		}
	}, [quote, address, chainId, chain.id, switchChainAsync, sendTransactionAsync]);

	const onReset = useCallback(() => {
		setFlight({ kind: "idle" });
		setQuote(null);
		setAmount("");
	}, []);

	const mainnetWarn = chain.id === 1 && Number.parseFloat(amount) > 0 && Number.parseFloat(amount) < 100;

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						<Pulse tone="accent" />
						bridge live
					</span>
				}
			>
				top up {agentTicker.toLowerCase()} treasury
			</Label>

			<p className="mb-3 font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed">
				send any token from any supported chain. funds route into the agent safe.
			</p>

			{flight.kind === "idle" || flight.kind === "failed" ? (
				<div className="flex flex-col gap-3">
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
								source chain
							</span>
							<ChainSelector disabled={signing} onChange={setChain} value={chain} />
						</div>
						<div className="space-y-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
								source token
							</span>
							<TokenSelector chain={chain} disabled={signing} onChange={setToken} value={token} />
						</div>
					</div>

					<div className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
						<div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							<span>amount</span>
							<span>
								on <span className="text-[var(--text-secondary)]">{chain.label}</span>
							</span>
						</div>
						<div className="flex items-center gap-2">
							<input
								aria-label="top up amount"
								className="w-full bg-transparent font-mono text-[22px] text-[var(--text-primary)] tabular-nums outline-none placeholder:text-[var(--text-tertiary)]"
								inputMode="decimal"
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0.0"
								value={amount}
							/>
							<span className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
								{token.symbol}
							</span>
						</div>
					</div>

					{mainnetWarn ? (
						<div className="rounded border border-[var(--negative)]/30 bg-[var(--negative)]/[0.06] p-2 font-mono text-[10px] text-[var(--negative)]">
							ethereum mainnet gas eats small transfers. consider $100+ or switch chains.
						</div>
					) : null}

					<QuoteSummary
						loading={quoteLoading}
						quote={quote}
						sourceDecimals={token.decimals}
						sourceSymbol={token.symbol}
					/>

					{flight.kind === "failed" ? (
						<div className="flex items-start gap-2 rounded border border-[var(--negative)]/30 bg-[var(--negative)]/[0.06] p-2 font-mono text-[10px] text-[var(--negative)]">
							<XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
							<span>{flight.message}</span>
						</div>
					) : null}

					{isConnected ? (
						<button
							className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#03110b] transition-colors hover:bg-[var(--accent-dim)] disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!quote || !quote.ok || signing || quoteLoading}
							onClick={onSubmit}
							type="button"
						>
							{signing ? "confirm in wallet" : `top up ${agentTicker.toLowerCase()}`}
							<ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					) : (
						<LinkedEoaCTA className="mt-1 w-full justify-center rounded-md bg-[var(--accent)] py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#03110b] hover:bg-[var(--accent-dim)]">
							connect wallet
						</LinkedEoaCTA>
					)}
				</div>
			) : (
				<FlightStatus chain={chain} flight={flight} onReset={onReset} />
			)}

			<div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span>powered by li.fi</span>
				<span>0% fee, 0.5% max slippage</span>
			</div>
		</Panel>
	);
}

function QuoteSummary({
	loading,
	quote,
	sourceDecimals,
	sourceSymbol,
}: {
	loading: boolean;
	quote: QuoteResult | null;
	sourceDecimals: number;
	sourceSymbol: string;
}) {
	if (loading) {
		return (
			<dl className="space-y-1.5 rounded-md border border-[var(--border-soft)] bg-black/10 p-3 font-mono text-[10px] text-[var(--text-tertiary)]">
				<RowSkeleton />
				<RowSkeleton />
				<RowSkeleton />
				<RowSkeleton />
			</dl>
		);
	}
	if (!quote) {
		return (
			<div className="rounded-md border border-[var(--border-soft)] bg-black/10 p-3 font-mono text-[10px] text-[var(--text-tertiary)]">
				enter an amount to see the route
			</div>
		);
	}
	if (!quote.ok) {
		return (
			<div className="rounded-md border border-[var(--negative)]/25 bg-[var(--negative)]/[0.04] p-3 font-mono text-[10px] text-[var(--negative)]">
				<div className="mb-1 uppercase tracking-[0.18em]">no route</div>
				<div className="text-[var(--text-secondary)]">{quote.message}</div>
			</div>
		);
	}

	const { quote: q, destination } = quote.data;
	return (
		<dl className="space-y-1.5 rounded-md border border-[var(--border-soft)] bg-black/10 p-3 font-mono text-[10px] text-[var(--text-tertiary)]">
			<div className="flex items-center justify-between">
				<dt>bridge</dt>
				<dd className="text-[var(--text-secondary)]">{q.bridgeLabel}</dd>
			</div>
			<div className="flex items-center justify-between">
				<dt>eta</dt>
				<dd className="tabular-nums text-[var(--text-secondary)]">{fmtSeconds(q.estimatedTime)}</dd>
			</div>
			<div className="flex items-center justify-between">
				<dt>fee + gas</dt>
				<dd className="tabular-nums text-[var(--text-secondary)]">{fmtUsd((q.feeUsd ?? 0) + (q.gasUsd ?? 0), "·")}</dd>
			</div>
			<div className="flex items-center justify-between">
				<dt>destination</dt>
				<dd className="tabular-nums text-[var(--text-secondary)]">agent-safe ({destination.chain})</dd>
			</div>
			<div className="flex items-center justify-between border-[var(--border-soft)] border-t pt-1.5">
				<dt className="uppercase tracking-[0.18em]">treasury receives</dt>
				<dd className="tabular-nums text-[var(--accent)]">
					{fmtTokenAmount(q.toAmount, 6)} <span className="text-[var(--text-tertiary)]">USDC</span>
				</dd>
			</div>
			<div className="flex items-center justify-between text-[9px]">
				<dt>min received</dt>
				<dd className="tabular-nums">{fmtTokenAmount(q.toAmountMin, 6)} USDC</dd>
			</div>
			<div className="flex items-center justify-between text-[9px]">
				<dt>you send</dt>
				<dd className="tabular-nums">
					{fmtTokenAmount(q.fromAmount, sourceDecimals)} {sourceSymbol}
				</dd>
			</div>
		</dl>
	);
}

function RowSkeleton() {
	return (
		<div className="flex items-center justify-between">
			<span className="h-2 w-12 rounded bg-white/[0.06]" />
			<span className="h-2 w-16 rounded bg-white/[0.06]" />
		</div>
	);
}

function FlightStatus({
	chain,
	flight,
	onReset,
}: {
	chain: ChainPreset;
	flight: FlightState;
	onReset: () => void;
}) {
	const steps = useMemo(
		() => [
			{ key: "signed", label: "signed", reached: flight.kind !== "idle" },
			{
				key: "bridging",
				label: "bridging",
				reached:
					flight.kind === "submitted" ||
					flight.kind === "pending" ||
					flight.kind === "completed" ||
					flight.kind === "partial",
			},
			{ key: "received", label: "received", reached: flight.kind === "completed" || flight.kind === "partial" },
		],
		[flight.kind],
	);

	const explorerHref =
		flight.kind !== "idle" && "txHash" in flight && flight.txHash ? chain.explorer + flight.txHash : null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
				<div className="flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">status</span>
					<span
						className={cn(
							"font-mono text-[14px]",
							flight.kind === "completed"
								? "text-[var(--positive)]"
								: flight.kind === "failed" || flight.kind === "refunded"
									? "text-[var(--negative)]"
									: "text-[var(--accent)]",
						)}
					>
						{flight.kind === "submitted"
							? "broadcast, awaiting bridge"
							: flight.kind === "pending"
								? "bridging in flight"
								: flight.kind === "completed"
									? "received"
									: flight.kind === "partial"
										? "partial receive"
										: flight.kind === "refunded"
											? "refunded"
											: "failed"}
					</span>
				</div>
				{flight.kind === "completed" ? (
					<CheckCircle2Icon className="h-6 w-6 text-[var(--positive)]" strokeWidth={1.5} />
				) : null}
			</div>

			<ol className="flex items-center justify-between gap-2">
				{steps.map((s, idx) => (
					<li className="flex flex-1 items-center gap-2" key={s.key}>
						<span
							className={cn(
								"flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[9px] tabular-nums",
								s.reached
									? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
									: "border-[var(--border-soft)] text-[var(--text-tertiary)]",
							)}
						>
							{idx + 1}
						</span>
						<span
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em]",
								s.reached ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
							)}
						>
							{s.label}
						</span>
					</li>
				))}
			</ol>

			{explorerHref ? (
				<a
					className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
					href={explorerHref}
					rel="noopener noreferrer"
					target="_blank"
				>
					view source tx
					<ExternalLinkIcon className="h-3 w-3" strokeWidth={1.5} />
				</a>
			) : null}

			{flight.kind === "failed" ? (
				<div className="rounded border border-[var(--negative)]/30 bg-[var(--negative)]/[0.06] p-2 font-mono text-[10px] text-[var(--negative)]">
					{flight.message}
				</div>
			) : null}

			<button
				className="mt-1 inline-flex w-full items-center justify-center rounded-md border border-[var(--border-mid)] bg-transparent py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
				onClick={onReset}
				type="button"
			>
				start new top up
			</button>
		</div>
	);
}

function mapStatusToFlight(
	data: { status: string; explorerLink?: string | null },
	current: FlightState,
): FlightState | null {
	if (current.kind === "idle" || current.kind === "failed") return null;
	const txHash = "txHash" in current ? current.txHash : "";
	const quote = "quote" in current ? current.quote : null;
	if (!quote) return null;
	switch (data.status) {
		case "pending":
			return { kind: "pending", txHash, quote };
		case "completed":
			return { kind: "completed", txHash, quote, explorerLink: data.explorerLink ?? null };
		case "partial":
			return { kind: "partial", txHash, quote };
		case "refunded":
			return { kind: "refunded", txHash, quote };
		case "failed":
			return { kind: "failed", txHash, message: "bridge reported failure. funds may be refunded." };
		case "submitted":
			return current;
		default:
			return current;
	}
}

export default TopUpPanel;
