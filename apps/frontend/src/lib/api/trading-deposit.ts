/**
 * Patron-page "fund hyperliquid trading" API client (Fork A — user-funded).
 *
 * This is the typed contract the FundTradingPanel builds against. It mirrors
 * the backend route `POST /v2/agents/:id/trading/deposit-quote`
 * (apps/api/src/routes/v2/agents-trading-deposit.ts +
 * services/hyperliquid/deposit-quote.ts).
 *
 * MONEY MODEL (Fork A, Shadow explicit): the patron funds THEIR OWN
 * hyperliquid account from their OWN connected wallet. Hyperliquid credits the
 * SENDER of the final Arbitrum-USDC transfer, so the funds must originate from
 * the patron's wallet — NOT the agent safe, NOT a platform/venue wallet, NOT
 * steward. The backend only PREPARES client-signed transactions; it never
 * signs or moves funds. The frontend NEVER holds keys and NEVER auto-executes.
 *
 * The deposit is up to TWO user-signed transactions:
 *   1. (only if the source isn't already Arbitrum USDC) a Li.Fi bridge route
 *      from the source token -> Arbitrum USDC, delivered to the patron's own
 *      wallet (`bridgeQuote.transactionRequest`).
 *   2. an ERC-20 transfer of Arbitrum USDC -> the Hyperliquid Arbitrum bridge,
 *      signed by the patron (`depositTx`). This is what Hyperliquid credits.
 *
 * The shapes below are kept structurally identical to the backend response so
 * there is a single, explicit integration seam (`depositQuotePath`).
 */

import { apiFetch } from "./_fetcher";

// Native-asset sentinel per Li.Fi convention.
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42_161;

// ── backend integration seam ──────────────────────────────────────
export function depositQuotePath(agentTokenAddress: string): string {
	return `/v2/agents/${encodeURIComponent(agentTokenAddress)}/trading/deposit-quote`;
}

// ── shapes (mirror services/hyperliquid/deposit-quote.ts) ─────────

/** The final user-signed Arbitrum USDC -> Hyperliquid bridge transfer. */
export interface HyperliquidDepositTx {
	kind: "hyperliquid-usdc-deposit";
	to: string;
	from: string;
	value: "0";
	data: `0x${string}`;
	chainId: number;
	/** USDC atoms (6dp) being deposited. */
	amount: string;
	token: string;
	bridge: string;
}

/** Optional first hop: Li.Fi bridge source -> Arbitrum USDC into patron wallet. */
export interface HyperliquidBridgeQuote {
	kind: "lifi-bridge-to-arbitrum-usdc";
	fromChain: number;
	toChain: number;
	fromToken: string;
	toToken: string;
	fromAmount: string;
	toAmount: string;
	toAmountMin: string;
	tool: string;
	approvalAddress: string | null;
	transactionRequest: {
		to: string;
		from: string | null;
		value: string | null;
		data: string;
		chainId: number;
		gasLimit: string | null;
	} | null;
}

export interface HyperliquidDepositQuote {
	mode: "patron-owns-hyperliquid-account";
	patronAddress: string;
	depositAccount: string;
	moneyPath: string[];
	/** null when the source is already Arbitrum USDC (single-tx deposit). */
	bridgeQuote: HyperliquidBridgeQuote | null;
	depositTx: HyperliquidDepositTx;
	integrator: { name: string; feeBps: number; slippageBps: number };
	warnings: string[];
}

export interface DepositQuoteSuccess {
	ok: true;
	data: {
		/** the patron-agent record echoed by requireAgentOwnership. */
		agent?: unknown;
		quote: HyperliquidDepositQuote;
	};
}

export interface DepositQuoteError {
	ok: false;
	error: string;
	message: string;
}

export type DepositQuoteResult = DepositQuoteSuccess | DepositQuoteError;

export interface DepositQuoteParams {
	agentTokenAddress: string;
	fromChain: number;
	fromToken: string;
	/** integer string in the source token's smallest unit. */
	amount: string;
	fromAddress: string;
}

/**
 * Ask the backend to PREPARE a hyperliquid deposit for the patron to sign. The
 * returned txs are signed by the USER in their own wallet — this function
 * NEVER signs or broadcasts.
 *
 * Returns a typed error result (instead of throwing) for the common cases the
 * panel renders honestly: 404 (route not deployed yet), 403 (wallet/owner
 * mismatch), or a network failure.
 */
export async function fetchDepositQuote(params: DepositQuoteParams): Promise<DepositQuoteResult> {
	try {
		return await apiFetch<DepositQuoteResult>(depositQuotePath(params.agentTokenAddress), {
			method: "POST",
			credentials: "include",
			body: JSON.stringify({
				fromChain: params.fromChain,
				fromToken: params.fromToken,
				amount: params.amount,
				fromAddress: params.fromAddress,
			}),
		});
	} catch (err) {
		const status = (err as { status?: number }).status;
		const code = (err as { code?: string }).code;
		const message = err instanceof Error ? err.message : "network error";
		if (status === 404) {
			return {
				ok: false,
				error: "DEPOSIT_NOT_CONFIGURED",
				message: "hyperliquid funding isn't wired up on this server yet.",
			};
		}
		if (status === 403) {
			return {
				ok: false,
				error: code ?? "FORBIDDEN",
				message: message || "your connected wallet must match the agent owner wallet.",
			};
		}
		return { ok: false, error: code ?? "NETWORK_ERROR", message };
	}
}

/** True when the source is already Arbitrum USDC, so the deposit is a single tx. */
export function isSingleStepDeposit(quote: HyperliquidDepositQuote): boolean {
	return quote.bridgeQuote === null;
}
