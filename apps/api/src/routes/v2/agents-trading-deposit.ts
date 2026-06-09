import { Hono } from "hono";
import type { Context } from "hono";

import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import {
	HyperliquidDepositQuoteError,
	buildHyperliquidDepositQuote,
} from "../../services/hyperliquid/deposit-quote.js";
import { LifiClientError, tryCreateLifiClient } from "../../services/lifi/client.js";

/**
 * Patron-facing Hyperliquid deposit quote endpoint.
 *
 * Fork A money model: the patron funds THEIR OWN Hyperliquid account from their
 * own connected EVM wallet. The backend only prepares client-signed
 * transactions:
 *   1. Optional ERC20 approval when Li.Fi requires a source-token spender.
 *   2. Optional Li.Fi route: source token -> Arbitrum USDC, toAddress = patron wallet.
 *   3. Arbitrum USDC transfer: patron wallet -> Hyperliquid Arbitrum bridge.
 *
 * Because Hyperliquid credits the sender of the final Arbitrum USDC transfer,
 * this route deliberately does NOT route to the agent Safe, the platform wallet,
 * or Steward's agent venue wallet. No server-side signing or fund movement is
 * performed here.
 */

const app = new Hono<RequireAgentOwnershipBindings>();

const ALLOWED_SOURCE_CHAINS = new Set([1, 10, 56, 137, 8453, 42_161]);

type DepositQuoteDeps = {
	lifi: ReturnType<typeof tryCreateLifiClient> | undefined;
};

const deps: DepositQuoteDeps = { lifi: undefined };

export function __setTradingDepositDepsForTest(next: Partial<DepositQuoteDeps>): void {
	deps.lifi = next.lifi;
}

function resolveLifi() {
	if (deps.lifi !== undefined) return deps.lifi;
	return tryCreateLifiClient();
}

function readNumber(body: Record<string, unknown>, ...keys: string[]): number | null {
	for (const key of keys) {
		const value = body[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number.parseInt(value, 10);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function readString(body: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = body[key];
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
	}
	return null;
}

/** Result of the shared deposit-quote handler (status + JSON body). */
export type DepositQuoteHandlerResult = { status: number; body: unknown };

/**
 * Core deposit-quote handler, factored out of the route closure so BOTH the
 * bespoke POST /:id/trading/deposit-quote route AND the generic capability
 * action dispatcher can delegate to the SAME logic. It is pure w.r.t. Hono
 * routing: it takes the already-authenticated Context (for patron/agent vars)
 * plus the parsed body, and returns a status + JSON body. It performs NO
 * server-side signing — it returns an unsigned tx the patron's own wallet signs.
 */
export async function runHyperliquidDepositQuote(
	c: Context<RequireAgentOwnershipBindings>,
	obj: Record<string, unknown>,
): Promise<DepositQuoteHandlerResult> {
	const fromChain = readNumber(obj, "fromChain", "fromChainId");
	const fromToken = readString(obj, "fromToken", "fromTokenAddress");
	const fromAmount = readString(obj, "amount", "fromAmount");
	const fromAddress = readString(obj, "fromAddress", "wallet", "walletAddress", "patronAddress");

	if (!fromChain || !fromToken || !fromAmount || !fromAddress) {
		return {
			status: 400,
			body: {
				ok: false,
				error: "MISSING_PARAMS",
				message: "fromChain, fromToken, amount, and fromAddress are required",
			},
		};
	}
	if (!ALLOWED_SOURCE_CHAINS.has(fromChain)) {
		return { status: 400, body: { ok: false, error: "CHAIN_NOT_SUPPORTED", message: "source chain not in allowlist" } };
	}
	if (!patronOwnsFundingWallet(c, fromAddress)) {
		return {
			status: 403,
			body: {
				ok: false,
				error: "FUNDING_WALLET_MISMATCH",
				message: "fromAddress must match the authenticated patron or agent owner wallet",
			},
		};
	}

	try {
		const quote = await buildHyperliquidDepositQuote(
			{ fromChain, fromToken, fromAmount, fromAddress },
			{ lifi: resolveLifi() },
		);
		const agent = c.get("patronAgent");
		return {
			status: 200,
			body: {
				ok: true,
				data: {
					agent: { id: agent.id, agentId: agent.agentId, stewardAgentId: agent.stewardAgentId },
					quote,
				},
			},
		};
	} catch (err) {
		if (err instanceof HyperliquidDepositQuoteError) {
			return { status: err.status, body: { ok: false, error: err.code, message: err.message } };
		}
		if (err instanceof LifiClientError) {
			const status = err.status >= 400 && err.status < 600 ? err.status : 502;
			return {
				status,
				body: { ok: false, error: err.code, message: err.message, upstreamStatus: err.status },
			};
		}
		return {
			status: 502,
			body: { ok: false, error: "DEPOSIT_QUOTE_FAILED", message: err instanceof Error ? err.message : String(err) },
		};
	}
}

function patronOwnsFundingWallet(c: Context<RequireAgentOwnershipBindings>, fromAddress: string): boolean {
	const patron = c.get("patron");
	const agent = c.get("patronAgent");
	const lower = fromAddress.toLowerCase();
	const primaryIsEvm = patron.primaryAddress ? /^0x[0-9a-fA-F]{40}$/.test(patron.primaryAddress) : false;
	// When the authenticated Steward session exposes an EVM wallet, require the
	// funding address to match it exactly. Only use the historical ownerAddress
	// fallback when Steward does not expose an EVM wallet for this session.
	if (primaryIsEvm) return patron.primaryAddress?.toLowerCase() === lower;
	return agent.ownerAddress?.toLowerCase() === lower;
}

app.post("/:id/trading/deposit-quote", requirePatron(), requireAgentOwnership("id"), async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON", message: "body must be JSON" }, 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ ok: false, error: "INVALID_BODY", message: "body object required" }, 400);
	}
	const result = await runHyperliquidDepositQuote(c, body as Record<string, unknown>);
	return c.json(result.body as Record<string, unknown>, result.status as 200);
});

export default app;
