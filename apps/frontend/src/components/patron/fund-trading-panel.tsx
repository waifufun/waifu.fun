/**
 * Fund-hyperliquid-trading panel (patron page, Fork A — user-funded).
 *
 * The agent owner funds their OWN hyperliquid trading account from their OWN
 * wallet. Pick an amount + source token, see the route + fees + eta, then sign.
 *
 * MONEY MODEL (Shadow explicit):
 *   - The USER triggers + signs everything from their OWN wallet.
 *   - NO platform custody. The frontend NEVER holds keys.
 *   - NO auto-execution. The user clicks + approves each tx in their wallet.
 *   - Hyperliquid credits the SENDER of the final Arbitrum-USDC transfer, so
 *     the funds originate from the patron's wallet, NOT the agent safe.
 *
 * The deposit is up to THREE user-signed transactions (from the backend quote
 * in `lib/api/trading-deposit.ts`):
 *   1. (only when the source is an ERC-20 the Li.Fi router must pull, i.e.
 *      `bridgeQuote.approvalAddress` is set) an ERC-20 `approve` of the source
 *      token to the Li.Fi router on the source chain. Native sources (BNB/ETH)
 *      and already-Arbitrum-USDC sources skip this.
 *   2. (only if source isn't already Arbitrum USDC) a Li.Fi bridge route ->
 *      Arbitrum USDC delivered to the patron's own wallet. The patron waits for
 *      the bridge to land, then signs step 3.
 *   3. an ERC-20 transfer of Arbitrum USDC -> the Hyperliquid Arbitrum bridge.
 *
 * So an ERC-20 cross-chain source (e.g. the default BSC USDT) is THREE sigs;
 * a native cross-chain source is TWO; a direct Arbitrum-USDC source is ONE.
 * The step count is derived from which txs the quote actually requires.
 *
 * No fake/optimistic states: each step reflects a real signed tx + an on-chain
 * receipt (wagmi useWaitForTransactionReceipt). The cross-chain wait between
 * the bridge and the deposit is surfaced honestly. the user comes back and signs the
 * deposit once their bridged USDC has landed.
 *
 * UI follows the patron-page grammar: Wave T `<Panel>`, mono numbers, lowercase
 * copy, single #00ff87 accent, honest empty/failed states, no em-dashes.
 */

"use client";

import { ArrowRightIcon, CheckCircle2Icon, ChevronDownIcon, ExternalLinkIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";

import { Label, Panel, Pulse } from "@/components/agent-home/wave-t/_primitives";
import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import {
	type DepositQuoteResult,
	HYPERLIQUID_ARBITRUM_CHAIN_ID,
	type HyperliquidDepositQuote,
	NATIVE_TOKEN,
	fetchDepositQuote,
} from "@/lib/api/trading-deposit";
import { cn } from "@/lib/utils";

interface FundTradingPanelProps {
	agentTokenAddress: string;
	agentTicker: string;
	/** Source chain to preselect. Defaults to BNB Chain (the on-chain path). */
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

const ARB_EXPLORER = "https://arbiscan.io/tx/";

const CHAIN_PRESETS: ChainPreset[] = [
	{
		id: 56,
		key: "bsc",
		label: "BNB Chain",
		explorer: "https://bscscan.com/tx/",
		tokens: [
			{ symbol: "BNB", address: NATIVE_TOKEN, decimals: 18, native: true },
			{ symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
		],
	},
	{
		id: 42_161,
		key: "arb",
		label: "Arbitrum",
		explorer: ARB_EXPLORER,
		tokens: [
			{ symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
			{ symbol: "ETH", address: NATIVE_TOKEN, decimals: 18, native: true },
		],
	},
	{
		id: 8_453,
		key: "base",
		label: "Base",
		explorer: "https://basescan.org/tx/",
		tokens: [
			{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
			{ symbol: "ETH", address: NATIVE_TOKEN, decimals: 18, native: true },
		],
	},
	{
		id: 10,
		key: "op",
		label: "Optimism",
		explorer: "https://optimistic.etherscan.io/tx/",
		tokens: [
			{ symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
			{ symbol: "ETH", address: NATIVE_TOKEN, decimals: 18, native: true },
		],
	},
	{
		id: 1,
		key: "eth",
		label: "Ethereum",
		explorer: "https://etherscan.io/tx/",
		tokens: [
			{ symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
			{ symbol: "ETH", address: NATIVE_TOKEN, decimals: 18, native: true },
		],
	},
];

// Flight state machine. For a direct Arbitrum-USDC source there is no bridge
// step, so we jump straight to depositing. For a cross-chain ERC-20 source the
// patron first signs an approval (so the Li.Fi router can pull the token), then
// the bridge, waits for it to land, then signs the deposit. Native cross-chain
// sources skip the approval.
type FlightState =
	| { kind: "idle" }
	// cross-chain ERC-20: approve(router) broadcast, waiting for the allowance tx
	| { kind: "approving"; approvalTx: string; quote: HyperliquidDepositQuote }
	// cross-chain: bridge tx broadcast, waiting for it to confirm on the source chain
	| { kind: "bridging"; bridgeTx: string; approvalTx?: string; quote: HyperliquidDepositQuote }
	// bridge source tx confirmed; USDC is in flight cross-chain. patron waits, then signs deposit.
	| { kind: "bridge-landed"; bridgeTx: string; approvalTx?: string; quote: HyperliquidDepositQuote }
	// deposit (Arbitrum USDC -> HL bridge) broadcast
	| { kind: "depositing"; depositTx: string; bridgeTx?: string; approvalTx?: string; quote: HyperliquidDepositQuote }
	// deposit confirmed on Arbitrum
	| { kind: "deposited"; depositTx: string; bridgeTx?: string; approvalTx?: string; quote: HyperliquidDepositQuote }
	| { kind: "failed"; message: string };

function fmtUsdcAtoms(raw: string): string {
	try {
		const n = Number(BigInt(raw)) / 1e6;
		if (!Number.isFinite(n)) return raw;
		if (n === 0) return "0";
		if (n < 1) return n.toFixed(4);
		if (n < 1_000) return n.toFixed(2);
		return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
	} catch {
		return raw;
	}
}

// An approval is required only for cross-chain ERC-20 sources: the Li.Fi router
// (`bridgeQuote.approvalAddress`) must be allowed to pull the source token
// before the bridge tx can move it. Native sources (BNB/ETH) and direct
// Arbitrum-USDC sources need no approval.
function bridgeApproval(quote: HyperliquidDepositQuote): { spender: string; token: string; amount: string } | null {
	const bridge = quote.bridgeQuote;
	if (!bridge) return null;
	if (!bridge.approvalAddress) return null;
	if (bridge.fromToken.toLowerCase() === NATIVE_TOKEN.toLowerCase()) return null;
	return { spender: bridge.approvalAddress, token: bridge.fromToken, amount: bridge.fromAmount };
}

function fmtSource(raw: string, decimals: number): string {
	try {
		const n = Number(BigInt(raw)) / 10 ** decimals;
		if (!Number.isFinite(n)) return raw;
		if (n === 0) return "0";
		if (n < 0.0001) return raw;
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
				className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] px-2.5 py-1.5 text-left hover:border-[var(--border-mid)] disabled:opacity-50"
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
				className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] px-2.5 py-1.5 text-left hover:border-[var(--border-mid)] disabled:opacity-50"
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

export function FundTradingPanel({ agentTokenAddress, agentTicker, defaultChainId = 56 }: FundTradingPanelProps) {
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
	const [quote, setQuote] = useState<DepositQuoteResult | null>(null);
	const [quoteLoading, setQuoteLoading] = useState(false);
	const [flight, setFlight] = useState<FlightState>({ kind: "idle" });
	const quoteSeq = useRef(0);

	useEffect(() => {
		setToken(chain.tokens[0]!);
		setQuote(null);
	}, [chain]);

	// Debounced quote fetch. Reads the route to SHOW the user; never signs.
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
				const result = await fetchDepositQuote({
					agentTokenAddress,
					fromChain: chain.id,
					fromToken: token.address,
					amount: raw.toString(),
					fromAddress: address,
				});
				if (cancelled || seq !== quoteSeq.current) return;
				setQuote(result);
			} finally {
				if (!cancelled && seq === quoteSeq.current) setQuoteLoading(false);
			}
		}, 350);
		return () => {
			cancelled = true;
			window.clearTimeout(handle);
		};
	}, [address, agentTokenAddress, amount, chain.id, token.address, token.decimals]);

	// Watch the in-flight tx for a real on-chain receipt. We watch the bridge tx
	// while bridging and the deposit tx while depositing — no optimistic states.
	const watchTxHash =
		flight.kind === "approving"
			? flight.approvalTx
			: flight.kind === "bridging"
				? flight.bridgeTx
				: flight.kind === "depositing"
					? flight.depositTx
					: undefined;
	const watchChainId =
		flight.kind === "approving"
			? flight.quote.bridgeQuote?.fromChain
			: flight.kind === "bridging"
				? flight.quote.bridgeQuote?.fromChain
				: flight.kind === "depositing"
					? HYPERLIQUID_ARBITRUM_CHAIN_ID
					: undefined;
	const { data: receipt, isError: receiptError } = useWaitForTransactionReceipt(
		watchTxHash
			? { hash: watchTxHash as `0x${string}`, ...(watchChainId ? { chainId: watchChainId } : {}) }
			: { hash: undefined },
	);

	// Sign the Li.Fi bridge tx (source -> Arbitrum USDC, into the patron wallet).
	// Carries the approvalTx through the flight when one was signed first.
	const sendBridge = useCallback(
		async (q: HyperliquidDepositQuote, approvalTx?: string) => {
			if (!address) return;
			const tx = q.bridgeQuote?.transactionRequest;
			const sourceChainId = q.bridgeQuote?.fromChain ?? chain.id;
			if (!tx) {
				setFlight({ kind: "failed", message: "no bridge calldata returned. refresh and retry." });
				return;
			}
			try {
				if (chainId !== sourceChainId) await switchChainAsync({ chainId: sourceChainId });
				const hash = await sendTransactionAsync({
					to: tx.to as `0x${string}`,
					data: tx.data as `0x${string}`,
					value: tx.value ? BigInt(tx.value) : 0n,
					chainId: sourceChainId,
					...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
				});
				setFlight({ kind: "bridging", bridgeTx: hash, ...(approvalTx ? { approvalTx } : {}), quote: q });
			} catch (err) {
				setFlight({ kind: "failed", message: err instanceof Error ? err.message : "bridge transaction failed" });
			}
		},
		[address, chainId, chain.id, switchChainAsync, sendTransactionAsync],
	);

	// Guards the one-shot approval -> bridge auto-advance so it fires exactly once
	// per approval, after the allowance tx confirms on the source chain.
	const advancedApprovalRef = useRef<string | null>(null);

	useEffect(() => {
		if (!receipt) return;
		// Only act on a receipt that belongs to the step we're CURRENTLY watching.
		// On a step transition, wagmi briefly still holds the previous tx's receipt
		// before re-keying to the new hash; matching transactionHash prevents the
		// new step from being marked done by the prior step's receipt.
		const confirmedHash = receipt.transactionHash?.toLowerCase();
		// A mined-but-reverted tx still returns a receipt. Never advance on it --
		// route it to the failed state so the user retries instead of, e.g.,
		// bridging without an allowance after a reverted approval.
		const reverted = receipt.status === "reverted";
		if (flight.kind === "approving") {
			if (confirmedHash !== flight.approvalTx.toLowerCase()) return;
			if (reverted) {
				setFlight((prev) =>
					prev.kind === "approving"
						? { kind: "failed", message: "approval reverted on-chain. check the explorer and retry." }
						: prev,
				);
				return;
			}
			// Approval confirmed -> auto-advance to the bridge tx (one-shot per hash).
			if (advancedApprovalRef.current === flight.approvalTx) return;
			advancedApprovalRef.current = flight.approvalTx;
			void sendBridge(flight.quote, flight.approvalTx);
			return;
		}
		if (flight.kind === "bridging") {
			if (confirmedHash !== flight.bridgeTx.toLowerCase()) return;
			if (reverted) {
				setFlight((prev) =>
					prev.kind === "bridging"
						? { kind: "failed", message: "bridge reverted on-chain. check the explorer and retry." }
						: prev,
				);
				return;
			}
			// Source-chain bridge tx confirmed. USDC is now in cross-chain flight.
			setFlight((prev) =>
				prev.kind === "bridging"
					? {
							kind: "bridge-landed",
							bridgeTx: prev.bridgeTx,
							...(prev.approvalTx ? { approvalTx: prev.approvalTx } : {}),
							quote: prev.quote,
						}
					: prev,
			);
			return;
		}
		if (flight.kind === "depositing") {
			if (confirmedHash !== flight.depositTx.toLowerCase()) return;
			if (reverted) {
				setFlight((prev) =>
					prev.kind === "depositing"
						? { kind: "failed", message: "deposit reverted on-chain. check the explorer and retry." }
						: prev,
				);
				return;
			}
			setFlight((prev) =>
				prev.kind === "depositing"
					? {
							kind: "deposited",
							depositTx: prev.depositTx,
							...(prev.bridgeTx ? { bridgeTx: prev.bridgeTx } : {}),
							...(prev.approvalTx ? { approvalTx: prev.approvalTx } : {}),
							quote: prev.quote,
						}
					: prev,
			);
		}
	}, [receipt, flight, sendBridge]);

	useEffect(() => {
		if (!receiptError) return;
		setFlight((prev) => {
			if (prev.kind === "approving" || prev.kind === "bridging" || prev.kind === "depositing") {
				return {
					kind: "failed",
					message: "transaction reverted or could not be confirmed. check the explorer and retry.",
				};
			}
			return prev;
		});
	}, [receiptError]);

	// Sign the ERC-20 approval so the Li.Fi router can pull the source token, then
	// the approval->bridge advance happens automatically once it confirms.
	const onApprove = useCallback(async () => {
		if (!quote || !quote.ok || !address) return;
		const q = quote.data.quote;
		const approval = bridgeApproval(q);
		if (!approval) {
			// No approval needed (native or direct source): go straight to bridge.
			await sendBridge(q);
			return;
		}
		const sourceChainId = q.bridgeQuote?.fromChain ?? chain.id;
		try {
			if (chainId !== sourceChainId) await switchChainAsync({ chainId: sourceChainId });
			const data = encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [approval.spender as `0x${string}`, BigInt(approval.amount)],
			});
			advancedApprovalRef.current = null;
			const hash = await sendTransactionAsync({
				to: approval.token as `0x${string}`,
				data,
				value: 0n,
				chainId: sourceChainId,
			});
			setFlight({ kind: "approving", approvalTx: hash, quote: q });
		} catch (err) {
			setFlight({ kind: "failed", message: err instanceof Error ? err.message : "approval transaction failed" });
		}
	}, [quote, address, chainId, chain.id, switchChainAsync, sendTransactionAsync, sendBridge]);

	// Sign the final ERC-20 transfer (Arbitrum USDC -> Hyperliquid bridge).
	const signDeposit = useCallback(
		async (q: HyperliquidDepositQuote, bridgeTx?: string, approvalTx?: string) => {
			if (!address) return;
			const dep = q.depositTx;
			try {
				if (chainId !== HYPERLIQUID_ARBITRUM_CHAIN_ID) {
					await switchChainAsync({ chainId: HYPERLIQUID_ARBITRUM_CHAIN_ID });
				}
				const hash = await sendTransactionAsync({
					to: dep.to as `0x${string}`,
					data: dep.data as `0x${string}`,
					value: 0n,
					chainId: HYPERLIQUID_ARBITRUM_CHAIN_ID,
				});
				setFlight({
					kind: "depositing",
					depositTx: hash,
					...(bridgeTx ? { bridgeTx } : {}),
					...(approvalTx ? { approvalTx } : {}),
					quote: q,
				});
			} catch (err) {
				setFlight({ kind: "failed", message: err instanceof Error ? err.message : "deposit transaction failed" });
			}
		},
		[address, chainId, switchChainAsync, sendTransactionAsync],
	);

	// Primary action from the idle/quote state. Three paths:
	//   - direct Arbitrum USDC source: sign the deposit only (1 sig).
	//   - native cross-chain source: bridge then deposit (2 sigs).
	//   - ERC-20 cross-chain source: approve, then bridge, then deposit (3 sigs).
	// onApprove no-ops the approval when none is needed and goes straight to the
	// bridge, so this stays a single entry point.
	const onSubmit = useCallback(async () => {
		if (!quote || !quote.ok || !address) return;
		const q = quote.data.quote;
		if (q.bridgeQuote === null) {
			await signDeposit(q);
		} else {
			await onApprove();
		}
	}, [quote, address, signDeposit, onApprove]);

	const onReset = useCallback(() => {
		setFlight({ kind: "idle" });
		setQuote(null);
		setAmount("");
	}, []);

	const mainnetWarn = chain.id === 1 && Number.parseFloat(amount) > 0 && Number.parseFloat(amount) < 100;
	const inFlight = flight.kind !== "idle" && flight.kind !== "failed";

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						<Pulse tone="accent" />
						hyperliquid
					</span>
				}
			>
				fund {agentTicker.toLowerCase()} trading
			</Label>

			<p className="mb-2 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
				fund this agent's hyperliquid trading from <span className="text-[var(--text-primary)]">your own wallet</span>.
				you pick the amount, you sign, the funds land in your hyperliquid account.
			</p>

			{/* Honest custody disclaimer. This is the user's capital, not the safe. */}
			<div className="mb-3 rounded-md border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]">
				<span className="text-[var(--accent)]">your wallet, your keys.</span> this funds from your wallet, not the agent
				safe/treasury. hyperliquid credits the sender, so the deposit must come from your wallet. nothing is custodied
				or auto-executed. you approve every transaction.
			</div>

			{!inFlight ? (
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
								aria-label="fund trading amount"
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

					<DepositQuoteSummary
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
							{signing
								? "confirm in wallet"
								: quote?.ok && quote.data.quote.bridgeQuote === null
									? "deposit to hyperliquid"
									: quote?.ok && bridgeApproval(quote.data.quote)
										? "approve + bridge + fund hyperliquid"
										: "bridge + fund hyperliquid"}
							<ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					) : (
						<LinkedEoaCTA className="mt-1 w-full justify-center rounded-md bg-[var(--accent)] py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#03110b] hover:bg-[var(--accent-dim)]">
							connect wallet
						</LinkedEoaCTA>
					)}
				</div>
			) : (
				<DepositFlightStatus
					chain={chain}
					flight={flight}
					signing={signing}
					onSignDeposit={() => {
						if (flight.kind === "bridge-landed") void signDeposit(flight.quote, flight.bridgeTx, flight.approvalTx);
					}}
					onReset={onReset}
				/>
			)}

			<div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span>powered by li.fi</span>
				<span>you sign, no custody</span>
			</div>
		</Panel>
	);
}

function DepositQuoteSummary({
	loading,
	quote,
	sourceDecimals,
	sourceSymbol,
}: {
	loading: boolean;
	quote: DepositQuoteResult | null;
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

	const q = quote.data.quote;
	const bridge = q.bridgeQuote;
	const isDirect = bridge === null;
	// Signature count is derived from the txs the quote actually requires:
	// direct = deposit only (1); native bridge = bridge + deposit (2);
	// ERC-20 bridge = approve + bridge + deposit (3).
	const needsApproval = bridgeApproval(q) !== null;
	const sigCount = isDirect ? 1 : needsApproval ? 3 : 2;
	return (
		<dl className="space-y-1.5 rounded-md border border-[var(--border-soft)] bg-black/10 p-3 font-mono text-[10px] text-[var(--text-tertiary)]">
			<div className="flex items-center justify-between">
				<dt>route</dt>
				<dd className="text-[var(--text-secondary)]">
					{isDirect ? "direct (arbitrum usdc)" : `bridge via ${bridge?.tool ?? "li.fi"}`}
				</dd>
			</div>
			<div className="flex items-center justify-between">
				<dt>steps</dt>
				<dd className="tabular-nums text-[var(--text-secondary)]">
					{sigCount} signature{sigCount === 1 ? "" : "s"}
					{needsApproval ? (
						<span className="text-[var(--text-tertiary)]">
							{" "}
							(approve {"\u2192"} bridge {"\u2192"} deposit)
						</span>
					) : null}
				</dd>
			</div>
			<div className="flex items-center justify-between">
				<dt>destination</dt>
				<dd className="text-[var(--text-secondary)]">your hyperliquid account</dd>
			</div>
			{!isDirect && bridge ? (
				<div className="flex items-center justify-between text-[9px]">
					<dt>bridge min out</dt>
					<dd className="tabular-nums">{fmtUsdcAtoms(bridge.toAmountMin)} USDC</dd>
				</div>
			) : null}
			<div className="flex items-center justify-between border-t border-[var(--border-soft)] pt-1.5">
				<dt className="uppercase tracking-[0.18em]">deposits to hl</dt>
				<dd className="tabular-nums text-[var(--accent)]">
					{fmtUsdcAtoms(q.depositTx.amount)} <span className="text-[var(--text-tertiary)]">USDC</span>
				</dd>
			</div>
			<div className="flex items-center justify-between text-[9px]">
				<dt>you send</dt>
				<dd className="tabular-nums">
					{isDirect
						? `${fmtUsdcAtoms(q.depositTx.amount)} USDC`
						: `${fmtSource(bridge?.fromAmount ?? "0", sourceDecimals)} ${sourceSymbol}`}
				</dd>
			</div>
			{q.warnings.length > 0 ? (
				<div className="border-t border-[var(--border-soft)] pt-1.5 text-[9px] leading-relaxed text-[var(--text-tertiary)]">
					{q.warnings[0]}
				</div>
			) : null}
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

function DepositFlightStatus({
	chain,
	flight,
	signing,
	onSignDeposit,
	onReset,
}: {
	chain: ChainPreset;
	flight: FlightState;
	signing: boolean;
	onSignDeposit: () => void;
	onReset: () => void;
}) {
	const inFlightQuote = flight.kind !== "idle" && flight.kind !== "failed" ? flight.quote : null;
	const hasBridge = inFlightQuote !== null && inFlightQuote.bridgeQuote !== null;
	const hasApproval = inFlightQuote !== null && bridgeApproval(inFlightQuote) !== null;

	const steps = useMemo(() => {
		const approvalReached =
			flight.kind === "approving" ||
			flight.kind === "bridging" ||
			flight.kind === "bridge-landed" ||
			flight.kind === "depositing" ||
			flight.kind === "deposited";
		const bridgeReached =
			flight.kind === "bridging" ||
			flight.kind === "bridge-landed" ||
			flight.kind === "depositing" ||
			flight.kind === "deposited";
		const depositSigned = flight.kind === "depositing" || flight.kind === "deposited";
		const depositDone = flight.kind === "deposited";
		if (!hasBridge) {
			return [
				{ key: "sign", label: "sign deposit", reached: depositSigned },
				{ key: "credited", label: "credited", reached: depositDone },
			];
		}
		return [
			...(hasApproval ? [{ key: "approve", label: "approve", reached: approvalReached }] : []),
			{ key: "bridge", label: "bridge", reached: bridgeReached },
			{ key: "land", label: "land", reached: flight.kind === "bridge-landed" || depositSigned },
			{ key: "deposit", label: "deposit", reached: depositSigned },
			{ key: "credited", label: "credited", reached: depositDone },
		];
	}, [flight, hasBridge, hasApproval]);

	const approvalTx =
		flight.kind !== "idle" && flight.kind !== "failed"
			? "approvalTx" in flight
				? flight.approvalTx
				: undefined
			: undefined;
	const bridgeTx =
		flight.kind !== "idle" && flight.kind !== "failed"
			? "bridgeTx" in flight
				? flight.bridgeTx
				: undefined
			: undefined;
	const depositTx = flight.kind === "depositing" || flight.kind === "deposited" ? flight.depositTx : undefined;

	const statusLine =
		flight.kind === "approving"
			? "approving li.fi router on source chain"
			: flight.kind === "bridging"
				? "bridging, confirming on source chain"
				: flight.kind === "bridge-landed"
					? "bridge sent. waiting for usdc on arbitrum"
					: flight.kind === "depositing"
						? "depositing to hyperliquid"
						: flight.kind === "deposited"
							? "deposited to hyperliquid"
							: "failed";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
				<div className="flex flex-col gap-1">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">status</span>
					<span
						className={cn(
							"font-mono text-[14px]",
							flight.kind === "deposited"
								? "text-[var(--positive)]"
								: flight.kind === "failed"
									? "text-[var(--negative)]"
									: "text-[var(--accent)]",
						)}
					>
						{statusLine}
					</span>
				</div>
				{flight.kind === "deposited" ? (
					<CheckCircle2Icon className="h-6 w-6 text-[var(--positive)]" strokeWidth={1.5} />
				) : null}
			</div>

			<ol className="flex items-center justify-between gap-2">
				{steps.map((s, idx) => (
					<li className="flex flex-1 items-center gap-1.5" key={s.key}>
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
								"font-mono text-[9px] uppercase tracking-[0.14em]",
								s.reached ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
							)}
						>
							{s.label}
						</span>
					</li>
				))}
			</ol>

			{/* The cross-chain wait: honest prompt to come back and sign the deposit. */}
			{flight.kind === "bridge-landed" ? (
				<div className="flex flex-col gap-2 rounded-md border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3">
					<p className="font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
						your bridge is on its way. once the usdc lands in your wallet on arbitrum (a few minutes), sign the deposit
						to send it to hyperliquid. check your wallet balance, then continue.
					</p>
					<button
						className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#03110b] transition-colors hover:bg-[var(--accent-dim)] disabled:cursor-not-allowed disabled:opacity-40"
						disabled={signing}
						onClick={onSignDeposit}
						type="button"
					>
						{signing ? "confirm in wallet" : "sign deposit to hyperliquid"}
						<ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>
			) : null}

			<div className="flex flex-col gap-1">
				{approvalTx ? (
					<a
						className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
						href={chain.explorer + approvalTx}
						rel="noopener noreferrer"
						target="_blank"
					>
						view approval tx
						<ExternalLinkIcon className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
				{bridgeTx ? (
					<a
						className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
						href={chain.explorer + bridgeTx}
						rel="noopener noreferrer"
						target="_blank"
					>
						view bridge tx
						<ExternalLinkIcon className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
				{depositTx ? (
					<a
						className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
						href={ARB_EXPLORER + depositTx}
						rel="noopener noreferrer"
						target="_blank"
					>
						view deposit tx
						<ExternalLinkIcon className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
			</div>

			<button
				className="mt-1 inline-flex w-full items-center justify-center rounded-md border border-[var(--border-mid)] bg-transparent py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
				onClick={onReset}
				type="button"
			>
				{flight.kind === "deposited" ? "fund again" : "start over"}
			</button>
		</div>
	);
}

export default FundTradingPanel;
