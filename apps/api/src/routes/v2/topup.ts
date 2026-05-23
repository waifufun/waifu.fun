/**
 * Patron top-up routes (Phase 2 Li.Fi MVP).
 *
 * Two endpoints:
 *   GET  /v2/agents/:address/topup/quote
 *   POST /v2/agents/:address/topup/status
 *
 * Both are scoped to a given agent token. The destination wallet is
 * resolved server-side from the `agent_safes` table joined through
 * `agent_personas`; the client never names a destination directly. This
 * keeps the recipient pinned to a wallet the platform curates, removing
 * the "patron typos the address" attack surface from the MVP.
 *
 * Phase 2 hardening:
 *   - Bridge allowlist enforced (see services/lifi/allowlist.ts)
 *   - 0.5% slippage cap baked into every quote request
 *   - 0% integrator fee
 *   - Every quote + status update audit-logged to `topup_events`
 *   - 30s in-process LRU cache keyed on request shape
 *   - 503 with a clear message when `LIFI_INTEGRATOR_KEY` is not set
 *
 * Steward is NOT involved. The patron signs the quote's transactionRequest
 * with their own wallet. This file does not touch the Steward vault.
 */

import { Hono } from "hono";

import { agentPersonas, agentSafes, getDatabase, topupEvents } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import { type LifiBridgeKey, checkConditionalRules, isBridgeAllowed } from "../../services/lifi/allowlist.js";
import {
	LIFI_INTEGRATOR_FEE,
	LIFI_SLIPPAGE_CAP,
	type LifiClient,
	LifiClientError,
	type LifiQuoteResponse,
	type LifiStatusResponse,
	tryCreateLifiClient,
} from "../../services/lifi/client.js";
import { QuoteCache } from "../../services/lifi/quote-cache.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_RE = /^(0x[0-9a-fA-F]{40}|NATIVE)$/i;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_RE = /^[0-9]+$/;

// Hyperliquid HyperCore deposit address shows up via Relay as chainId 999.
const ALLOWED_CHAIN_IDS = new Set([1, 10, 56, 137, 8453, 42_161, 999]);

const quoteCache = new QuoteCache<LifiQuoteResponse>();

type TopupDepsForTest = {
	db: Database | undefined;
	lifi: LifiClient | undefined;
};

const topupDepsForTest: TopupDepsForTest = { db: undefined, lifi: undefined };

export function __setTopupRoutesDepsForTest(deps: Partial<TopupDepsForTest>): void {
	topupDepsForTest.db = deps.db;
	topupDepsForTest.lifi = deps.lifi;
}

function resolveDb(): Database | null {
	if (topupDepsForTest.db) return topupDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function resolveLifi(): LifiClient | null {
	if (topupDepsForTest.lifi) return topupDepsForTest.lifi;
	return tryCreateLifiClient();
}

/**
 * Look up the AgentSafe for an agent token. Joins agent_personas (which
 * holds the on-chain token address) to agent_safes (which holds the
 * platform-curated Safe address). When the wallet registry table lands
 * (feat/wallet-registry-2026-05-22), this should also check that table
 * for role='agent-safe' as a more generic source. For now the safe table
 * is the source of truth.
 */
async function resolveAgentSafe(
	db: Database,
	agentTokenAddress: string,
): Promise<{ address: string; chain: string; chainId: number } | null> {
	const [row] = await db
		.select({
			safeAddress: agentSafes.safeAddress,
			chain: agentSafes.chain,
			chainId: agentSafes.chainId,
		})
		.from(agentPersonas)
		.innerJoin(agentSafes, eq(agentSafes.agentId, agentPersonas.id))
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${agentTokenAddress}`)
		.limit(1);
	if (!row?.safeAddress) return null;
	return { address: row.safeAddress, chain: row.chain ?? "bsc", chainId: row.chainId ?? 56 };
}

async function ensureAgentExists(db: Database, tokenAddress: string): Promise<string | null> {
	const [row] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${tokenAddress}`)
		.limit(1);
	return row?.tokenAddress ? row.tokenAddress.toLowerCase() : null;
}

function parseUsdString(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : undefined;
}

function quoteCacheKey(input: Record<string, string>): string {
	return [
		input.agent,
		input.fromChain,
		input.fromToken,
		input.fromAmount,
		input.fromAddress,
		input.toAddress,
		input.toChain,
		input.toToken,
	].join("|");
}

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

function shapeQuote(raw: LifiQuoteResponse): ShapedQuote {
	const fee = (raw.estimate.feeCosts ?? []).reduce((acc, c) => acc + (parseUsdString(c.amountUSD) ?? 0), 0);
	const gas = (raw.estimate.gasCosts ?? []).reduce((acc, c) => acc + (parseUsdString(c.amountUSD) ?? 0), 0);
	const tx = raw.transactionRequest;
	const txData = tx
		? {
				to: tx.to,
				from: tx.from ?? null,
				value: tx.value ?? null,
				data: tx.data,
				chainId: tx.chainId ?? raw.action.fromChainId,
				gasLimit: tx.gasLimit ?? null,
			}
		: null;
	return {
		bridge: raw.tool,
		bridgeLabel: raw.toolDetails?.name ?? raw.tool,
		estimatedTime: raw.estimate.executionDuration ?? 0,
		feeUsd: fee > 0 ? fee : null,
		gasUsd: gas > 0 ? gas : null,
		fromAmount: raw.estimate.fromAmount,
		fromAmountUsd: parseUsdString(raw.estimate.fromAmountUSD) ?? null,
		toAmount: raw.estimate.toAmount,
		toAmountMin: raw.estimate.toAmountMin,
		toAmountUsd: parseUsdString(raw.estimate.toAmountUSD) ?? null,
		approvalAddress: raw.estimate.approvalAddress ?? null,
		txData,
	};
}

function withinSlippage(toAmount: string, toAmountMin: string): boolean {
	try {
		const a = BigInt(toAmount);
		const min = BigInt(toAmountMin);
		if (a === 0n) return false;
		const diff = a > min ? a - min : 0n;
		// slippage <= 0.5%  =>  diff/a <= 5/1000.
		return diff * 1000n <= a * 5n;
	} catch {
		return false;
	}
}

function readChain(body: unknown, key: string): number | undefined {
	const v = (body as Record<string, unknown> | null)?.[key];
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = Number.parseInt(v, 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function readString(body: unknown, key: string): string | undefined {
	const v = (body as Record<string, unknown> | null)?.[key];
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function audit(
	db: Database,
	row: {
		agentTokenAddress: string;
		patronAddress: string;
		fromChain: number;
		fromToken: string;
		fromAmount: string;
		toChain: number;
		toToken: string;
		toAddress: string;
		toAmount?: string;
		bridge?: string;
		status: "quoted" | "failed";
		errorCode?: string;
		errorMessage?: string;
	},
): Promise<void> {
	try {
		await db.insert(topupEvents).values({
			agentTokenAddress: row.agentTokenAddress,
			patronAddress: row.patronAddress,
			fromChain: row.fromChain,
			fromToken: row.fromToken,
			fromAmount: row.fromAmount,
			toChain: row.toChain,
			toToken: row.toToken,
			toAddress: row.toAddress,
			toAmount: row.toAmount ?? null,
			bridge: row.bridge ?? null,
			status: row.status,
			errorCode: row.errorCode ?? null,
			errorMessage: row.errorMessage ?? null,
		});
	} catch {
		// Audit failures must not break the user-facing flow.
	}
}

function mapLifiStatus(
	s: LifiStatusResponse,
): "pending" | "completed" | "partial" | "refunded" | "failed" | "submitted" {
	if (s.status === "DONE") {
		if (s.substatus === "PARTIAL") return "partial";
		if (s.substatus === "REFUNDED") return "refunded";
		return "completed";
	}
	if (s.status === "FAILED") return "failed";
	if (s.status === "PENDING") return "pending";
	return "submitted";
}

const app = new Hono();

app.get("/:address/topup/quote", async (c) => {
	const agentParam = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(agentParam)) {
		return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
	}

	const fromChainStr = c.req.query("fromChain");
	const fromToken = c.req.query("fromToken");
	const fromAmount = c.req.query("amount");
	const fromAddress = c.req.query("fromAddress");
	const toTokenOverride = c.req.query("toToken");

	if (!fromChainStr || !fromToken || !fromAmount || !fromAddress) {
		return c.json(
			{
				ok: false,
				error: "MISSING_PARAMS",
				message: "fromChain, fromToken, amount, and fromAddress are required",
			},
			400,
		);
	}
	const fromChain = Number.parseInt(fromChainStr, 10);
	if (!Number.isFinite(fromChain) || !ALLOWED_CHAIN_IDS.has(fromChain)) {
		return c.json({ ok: false, error: "CHAIN_NOT_SUPPORTED", message: "source chain not in allowlist" }, 400);
	}
	if (!TOKEN_RE.test(fromToken)) {
		return c.json({ ok: false, error: "INVALID_TOKEN", message: "invalid fromToken" }, 400);
	}
	if (!AMOUNT_RE.test(fromAmount) || fromAmount === "0") {
		return c.json({ ok: false, error: "INVALID_AMOUNT", message: "amount must be a positive integer string" }, 400);
	}
	if (!ADDRESS_RE.test(fromAddress)) {
		return c.json({ ok: false, error: "INVALID_FROM_ADDRESS", message: "invalid fromAddress" }, 400);
	}

	const lifi = resolveLifi();
	if (!lifi) {
		return c.json(
			{
				ok: false,
				error: "TOPUP_NOT_CONFIGURED",
				message:
					"top-up is not configured on this server. LIFI_INTEGRATOR_KEY is missing. ask the operator to provision a Li.Fi partner key.",
			},
			503,
		);
	}

	const db = resolveDb();
	if (!db) {
		return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);
	}

	const agentTokenAddress = await ensureAgentExists(db, agentParam);
	if (!agentTokenAddress) {
		return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" }, 404);
	}

	const safe = await resolveAgentSafe(db, agentTokenAddress);
	if (!safe) {
		return c.json(
			{
				ok: false,
				error: "DESTINATION_UNAVAILABLE",
				message: "no agent-safe wallet registered for this agent; cannot route top-up.",
			},
			409,
		);
	}

	// Phase 2 MVP destination: Arbitrum USDC (the canonical Sol HL funding
	// route). We bridge into the agent's Safe address on Arbitrum even when
	// the Safe is deployed on a different chain in `agent_safes`; the Safe
	// owners can sweep to the BSC instance separately. Phase 3 generalizes
	// this via per-agent destination chain configuration.
	const toChain = 42_161;
	const toToken =
		toTokenOverride && TOKEN_RE.test(toTokenOverride) ? toTokenOverride : "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // USDC on Arbitrum

	const cacheKey = quoteCacheKey({
		agent: agentTokenAddress,
		fromChain: String(fromChain),
		fromToken,
		fromAmount,
		fromAddress: fromAddress.toLowerCase(),
		toAddress: safe.address.toLowerCase(),
		toChain: String(toChain),
		toToken,
	});

	let raw = quoteCache.get(cacheKey);
	let cached = true;
	if (!raw) {
		cached = false;
		try {
			raw = await lifi.getQuote({
				fromChain,
				toChain,
				fromToken,
				toToken,
				fromAmount,
				fromAddress,
				toAddress: safe.address,
			});
		} catch (err) {
			if (err instanceof LifiClientError) {
				const responseStatus =
					err.status >= 400 && err.status < 600 ? (err.status as 400 | 404 | 409 | 422 | 500 | 502 | 503) : 502;
				return c.json({ ok: false, error: err.code, message: err.message, upstreamStatus: err.status }, responseStatus);
			}
			return c.json({ ok: false, error: "LIFI_UPSTREAM_ERROR", message: errMessage(err) }, 502);
		}
		quoteCache.set(cacheKey, raw);
	}

	if (!isBridgeAllowed(raw.tool)) {
		await audit(db, {
			agentTokenAddress,
			patronAddress: fromAddress.toLowerCase(),
			fromChain,
			fromToken,
			fromAmount,
			toChain,
			toToken,
			toAddress: safe.address.toLowerCase(),
			status: "failed",
			errorCode: "BRIDGE_NOT_ALLOWED",
			errorMessage: `Li.Fi returned non-allowlisted bridge: ${raw.tool}`,
		});
		return c.json(
			{
				ok: false,
				error: "BRIDGE_NOT_ALLOWED",
				message: `Li.Fi returned a non-allowlisted bridge (${raw.tool}). top-up refused.`,
			},
			400,
		);
	}
	for (const step of raw.includedSteps ?? []) {
		if (!isBridgeAllowed(step.tool)) {
			return c.json(
				{
					ok: false,
					error: "BRIDGE_STEP_NOT_ALLOWED",
					message: `Li.Fi included a non-allowlisted step (${step.tool}). top-up refused.`,
				},
				400,
			);
		}
	}
	const conditional = checkConditionalRules(raw.tool as LifiBridgeKey, {
		fromChain,
		toChain,
		fromTokenSymbol: raw.action.fromToken.symbol,
		toTokenSymbol: raw.action.toToken.symbol,
		estimatedUsd: parseUsdString(raw.estimate.fromAmountUSD),
	});
	if (conditional) {
		return c.json(
			{
				ok: false,
				error: conditional,
				message: `route refused by conditional policy (${conditional}).`,
			},
			400,
		);
	}

	if (raw.action.toAddress.toLowerCase() !== safe.address.toLowerCase()) {
		return c.json(
			{
				ok: false,
				error: "RECIPIENT_MISMATCH",
				message: "Li.Fi returned a route with a different recipient than the agent-safe address.",
			},
			400,
		);
	}

	const shaped = shapeQuote(raw);

	if (!withinSlippage(shaped.toAmount, shaped.toAmountMin)) {
		return c.json(
			{
				ok: false,
				error: "SLIPPAGE_EXCEEDED",
				message: `quoted slippage exceeds the ${LIFI_SLIPPAGE_CAP * 100}% cap. refresh and retry.`,
			},
			400,
		);
	}

	if (!cached) {
		await audit(db, {
			agentTokenAddress,
			patronAddress: fromAddress.toLowerCase(),
			fromChain,
			fromToken,
			fromAmount,
			toChain,
			toToken,
			toAddress: safe.address.toLowerCase(),
			toAmount: shaped.toAmount,
			bridge: raw.tool,
			status: "quoted",
		});
	}

	c.header("Cache-Control", "private, max-age=15");
	return c.json({
		ok: true,
		data: {
			agentTokenAddress,
			destination: {
				address: safe.address,
				chain: safe.chain,
				chainId: toChain,
				token: toToken,
			},
			quote: shaped,
			integrator: {
				name: "waifu",
				feeBps: LIFI_INTEGRATOR_FEE * 10_000,
				slippageBps: LIFI_SLIPPAGE_CAP * 10_000,
			},
			cached,
		},
	});
});

app.post("/:address/topup/status", async (c) => {
	const agentParam = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(agentParam)) {
		return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON", message: "body must be JSON" }, 400);
	}
	const txHash =
		typeof (body as { txHash?: unknown })?.txHash === "string" ? ((body as { txHash: string }).txHash as string) : null;
	if (!txHash || !TX_HASH_RE.test(txHash)) {
		return c.json({ ok: false, error: "INVALID_TX_HASH", message: "txHash must be a 0x... 32-byte hash" }, 400);
	}

	const lifi = resolveLifi();
	if (!lifi) {
		return c.json(
			{ ok: false, error: "TOPUP_NOT_CONFIGURED", message: "top-up is not configured on this server." },
			503,
		);
	}

	const db = resolveDb();
	if (!db) {
		return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);
	}

	const fromChain = readChain(body, "fromChain");
	const toChain = readChain(body, "toChain");
	const bridge = readString(body, "bridge");

	let status: LifiStatusResponse;
	try {
		status = await lifi.getStatus({
			txHash,
			...(fromChain ? { fromChain } : {}),
			...(toChain ? { toChain } : {}),
			...(bridge ? { bridge } : {}),
		});
	} catch (err) {
		if (err instanceof LifiClientError) {
			return c.json({ ok: false, error: err.code, message: err.message }, 502);
		}
		return c.json({ ok: false, error: "LIFI_UPSTREAM_ERROR", message: errMessage(err) }, 502);
	}

	const mapped = mapLifiStatus(status);

	await db
		.update(topupEvents)
		.set({
			status: mapped,
			txHash,
			...(status.tool && isBridgeAllowed(status.tool) ? { bridge: status.tool } : {}),
			...(status.receiving?.amount ? { toAmount: status.receiving.amount } : {}),
			updatedAt: new Date(),
		})
		.where(eq(topupEvents.txHash, txHash));

	return c.json({
		ok: true,
		data: {
			status: mapped,
			lifiStatus: status.status,
			lifiSubstatus: status.substatus ?? null,
			bridge: status.tool ?? null,
			explorerLink: status.bridgeExplorerLink ?? null,
			receivingTxHash: status.receiving?.txHash ?? null,
		},
	});
});

export default app;
