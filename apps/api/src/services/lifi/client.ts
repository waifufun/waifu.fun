/**
 * Thin Li.Fi REST client for the Phase 2 patron top-up MVP.
 *
 * Proxies `/v1/quote` and `/v1/status` only. Quote requests embed our
 * integrator string + 0% fee + 0.5% slippage cap + the pinned bridge
 * allowlist (see allowlist.ts). The API key is sourced from
 * `LIFI_INTEGRATOR_KEY`; when missing the caller surfaces a 503 instead
 * of leaking the request to the unauthenticated rate-limit bucket.
 */

import { LIFI_BRIDGE_ALLOWLIST } from "./allowlist.js";

const LIFI_BASE_URL = "https://li.quest";
const INTEGRATOR_NAME = "waifu";
const SLIPPAGE_CAP = 0.005; // 0.5%
// Default integrator fee fraction. 0 = no fee (inert) unless overridden by the
// LIFI_INTEGRATOR_FEE env var. Turning this on monetizes LI.FI swaps/top-ups:
// the fee accrues to the wallet registered for the integrator key in the LI.FI
// Partner Portal (FeeForwarder forwards it directly at execution). Set that
// receiver to the platform Safe 0x0985cCC0fD7C568d493874D845471D5F4B1D9c3c.
const DEFAULT_INTEGRATOR_FEE = 0;
// Hard ceiling so a fat-fingered env can't charge an absurd fee.
const MAX_INTEGRATOR_FEE = 0.01; // 1%

function clampIntegratorFee(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) return DEFAULT_INTEGRATOR_FEE;
	return Math.min(value, MAX_INTEGRATOR_FEE);
}

function parseIntegratorFeeEnv(raw: string | undefined): number {
	if (!raw || raw.trim() === "") return DEFAULT_INTEGRATOR_FEE;
	return clampIntegratorFee(Number(raw));
}

export interface LifiQuoteInput {
	fromChain: number;
	toChain: number;
	fromToken: string;
	toToken: string;
	fromAmount: string;
	fromAddress: string;
	toAddress: string;
}

export interface LifiQuoteEstimate {
	fromAmount: string;
	toAmount: string;
	toAmountMin: string;
	approvalAddress?: string;
	executionDuration?: number;
	feeCosts?: Array<{ name: string; amountUSD?: string }>;
	gasCosts?: Array<{ amountUSD?: string }>;
	fromAmountUSD?: string;
	toAmountUSD?: string;
}

export interface LifiAction {
	fromChainId: number;
	toChainId: number;
	fromToken: { symbol: string; address: string; decimals?: number };
	toToken: { symbol: string; address: string; decimals?: number };
	fromAddress: string;
	toAddress: string;
}

export interface LifiTransactionRequest {
	to: string;
	from?: string;
	value?: string;
	data: string;
	chainId?: number;
	gasLimit?: string;
	gasPrice?: string;
}

export interface LifiQuoteResponse {
	id: string;
	type: string;
	tool: string;
	toolDetails?: { key: string; name: string; logoURI?: string };
	action: LifiAction;
	estimate: LifiQuoteEstimate;
	transactionRequest?: LifiTransactionRequest;
	includedSteps?: Array<{ tool: string }>;
}

export type LifiStatusState = "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";

export interface LifiStatusResponse {
	status: LifiStatusState;
	substatus?: string;
	substatusMessage?: string;
	tool?: string;
	bridgeExplorerLink?: string;
	fromAddress?: string;
	toAddress?: string;
	sending?: { chainId?: number; txHash?: string; token?: { symbol?: string } };
	receiving?: { chainId?: number; txHash?: string; token?: { symbol?: string }; amount?: string };
}

export class LifiClientError extends Error {
	readonly status: number;
	readonly code: string;
	readonly upstreamBody: unknown;
	constructor(message: string, opts: { status: number; code: string; body?: unknown }) {
		super(message);
		this.name = "LifiClientError";
		this.status = opts.status;
		this.code = opts.code;
		this.upstreamBody = opts.body;
	}
}

export interface LifiClientConfig {
	apiKey: string;
	integrator?: string;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	// Integrator fee fraction (e.g. 0.002 = 20bps). Defaults to 0 (no fee).
	integratorFee?: number;
}

export class LifiClient {
	private readonly apiKey: string;
	private readonly integrator: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly integratorFee: number;

	constructor(cfg: LifiClientConfig) {
		this.apiKey = cfg.apiKey;
		this.integrator = cfg.integrator ?? INTEGRATOR_NAME;
		this.baseUrl = cfg.baseUrl ?? LIFI_BASE_URL;
		this.fetchImpl = cfg.fetchImpl ?? fetch;
		this.integratorFee = clampIntegratorFee(cfg.integratorFee);
	}

	async getQuote(input: LifiQuoteInput): Promise<LifiQuoteResponse> {
		const params = new URLSearchParams({
			fromChain: String(input.fromChain),
			toChain: String(input.toChain),
			fromToken: input.fromToken,
			toToken: input.toToken,
			fromAmount: input.fromAmount,
			fromAddress: input.fromAddress,
			toAddress: input.toAddress,
			integrator: this.integrator,
			fee: String(this.integratorFee),
			slippage: String(SLIPPAGE_CAP),
			order: "RECOMMENDED",
			allowDestinationCall: "false",
		});
		// Repeat-param array encoding per the Phase 1 spike gotcha.
		for (const tool of LIFI_BRIDGE_ALLOWLIST) {
			params.append("allowBridges", tool);
		}

		const url = `${this.baseUrl}/v1/quote?${params.toString()}`;
		const res = await this.fetchImpl(url, {
			method: "GET",
			headers: { accept: "application/json", "x-lifi-api-key": this.apiKey },
		});
		const body = await this.safeJson(res);
		if (!res.ok) {
			throw new LifiClientError(extractMessage(body) ?? `Li.Fi quote failed (${res.status})`, {
				status: res.status,
				code: "LIFI_QUOTE_FAILED",
				body,
			});
		}
		return body as LifiQuoteResponse;
	}

	async getStatus(input: {
		txHash: string;
		fromChain?: number;
		toChain?: number;
		bridge?: string;
	}): Promise<LifiStatusResponse> {
		const params = new URLSearchParams({ txHash: input.txHash });
		if (input.fromChain) params.set("fromChain", String(input.fromChain));
		if (input.toChain) params.set("toChain", String(input.toChain));
		if (input.bridge) params.set("bridge", input.bridge);
		const url = `${this.baseUrl}/v1/status?${params.toString()}`;
		const res = await this.fetchImpl(url, {
			method: "GET",
			headers: { accept: "application/json", "x-lifi-api-key": this.apiKey },
		});
		const body = await this.safeJson(res);
		if (!res.ok) {
			throw new LifiClientError(extractMessage(body) ?? `Li.Fi status failed (${res.status})`, {
				status: res.status,
				code: "LIFI_STATUS_FAILED",
				body,
			});
		}
		return body as LifiStatusResponse;
	}

	private async safeJson(res: Response): Promise<unknown> {
		const text = await res.text();
		if (!text) return null;
		try {
			return JSON.parse(text);
		} catch {
			return { raw: text };
		}
	}
}

function extractMessage(body: unknown): string | null {
	if (body && typeof body === "object" && "message" in body) {
		const msg = (body as { message: unknown }).message;
		return typeof msg === "string" ? msg : null;
	}
	return null;
}

/**
 * Resolve a `LifiClient` from the env or return null when the integrator
 * key has not been provisioned. Routes use this signal to return 503
 * "topup not configured" without exposing the missing-secret to clients.
 */
export function tryCreateLifiClient(env: NodeJS.ProcessEnv = process.env): LifiClient | null {
	const apiKey = env.LIFI_INTEGRATOR_KEY?.trim();
	if (!apiKey) return null;
	const integrator = env.LIFI_INTEGRATOR?.trim() || INTEGRATOR_NAME;
	const integratorFee = parseIntegratorFeeEnv(env.LIFI_INTEGRATOR_FEE);
	return new LifiClient({ apiKey, integrator, integratorFee });
}

export const LIFI_SLIPPAGE_CAP = SLIPPAGE_CAP;
// Resolved from env at read time so callers/tests reflect the configured fee.
export function resolveLifiIntegratorFee(env: NodeJS.ProcessEnv = process.env): number {
	return parseIntegratorFeeEnv(env.LIFI_INTEGRATOR_FEE);
}
// Back-compat: the legacy constant export now reflects the env-resolved fee.
export const LIFI_INTEGRATOR_FEE = parseIntegratorFeeEnv(process.env.LIFI_INTEGRATOR_FEE);
