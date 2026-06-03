/**
 * Minimal Steward HTTP client scoped to the three calls we need for
 * agent-launch:
 *   1. provision an agent wallet        (POST /agents)
 *   2. sign an arbitrary message        (POST /vault/:agentId/sign-message)
 *   3. sign + broadcast a transaction   (POST /vault/:agentId/sign)
 *
 * We intentionally do NOT depend on @stwd/sdk here — the SDK lives in
 * elsewhere in the monorepo ecosystem and waifu-core's package.json does not
 * declare it. Wiring a direct fetch client keeps our deps small and mirrors
 * the SDK surface 1-for-1 for the endpoints we care about.
 */

import type { Address, Hex } from "viem";

export class StewardError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(message: string, status: number, body?: unknown) {
		super(message);
		this.name = "StewardError";
		this.status = status;
		this.body = body;
	}
}

export interface StewardConfig {
	/** Base URL, e.g. "https://eliza.steward.fi" */
	baseUrl: string;
	/**
	 * Tenant API key (X-Steward-Key). Required when authenticating server-to-server
	 * with a tenant-scoped key. Mutually exclusive with `bearerToken`.
	 */
	apiKey?: string;
	/**
	 * Pre-minted HS256 bearer (Authorization: Bearer). Use this for cross-tenant
	 * reads/writes where the tenant API key has no access (e.g. a cloud agent whose
	 * Steward identity lives under tenant `elizacloud`, which the waifu tenant key
	 * cannot reach). Mutually exclusive with `apiKey`.
	 */
	bearerToken?: string;
	/** Tenant id (X-Steward-Tenant). Required. */
	tenantId: string;
	/** Optional fetch impl for tests. Defaults to globalThis.fetch. */
	fetchImpl?: typeof fetch;
}

export interface StewardAgentIdentity {
	id: string;
	tenantId: string;
	name: string;
	walletAddress: Address;
	walletAddresses?: {
		evm?: Address;
		solana?: string;
	};
	platformId?: string;
	createdAt: string;
}

export interface StewardSignMessageResult {
	signature: Hex;
}

export interface StewardSignTxInput {
	to: Address;
	value: string; // decimal string in wei
	data?: Hex;
	chainId?: number;
	/** If true, Steward broadcasts the signed tx and returns txHash. */
	broadcast?: boolean;
}

export interface StewardSignTxBroadcastResult {
	txHash: Hex;
	caip2?: string;
}

export interface StewardSignTxRawResult {
	signedTx: Hex;
	caip2?: string;
}

export interface StewardPendingApproval {
	status: "pending_approval";
	results: unknown[];
}

export type StewardSignTxResult = StewardSignTxBroadcastResult | StewardSignTxRawResult | StewardPendingApproval;

/**
 * Trading-policy caps as exposed by Steward `/v1/agents/:id/policy`.
 *
 * These are the high-level money guardrails the patron controls: spend caps,
 * leverage ceiling, and the allow-lists of assets + venues the agent may
 * touch. All fields are optional so a partial PUT only mutates what's sent.
 */
export interface StewardPolicyCaps {
	dailyCap?: number | null;
	perOrderCap?: number | null;
	leverageCap?: number | null;
	allowedAssets?: string[];
	allowedVenues?: string[];
	[key: string]: unknown;
}

/**
 * A single rule in Steward `/v1/agents/:id/policies`. The withdraw-address
 * whitelist is modelled as a rule of type `approved-addresses` whose
 * `addresses` array is the set of destinations funds may leave to.
 */
export interface StewardPolicyRule {
	id?: string;
	type: string;
	addresses?: string[];
	[key: string]: unknown;
}

const STEWARD_DEFAULT_BASE_URL = "https://eliza.steward.fi";

export class StewardClient {
	private readonly baseUrl: string;
	private readonly apiKey: string | undefined;
	private readonly bearerToken: string | undefined;
	private readonly tenantId: string;
	private readonly fetchImpl: typeof fetch;

	constructor(config: StewardConfig) {
		if (!config.apiKey && !config.bearerToken) {
			throw new Error("StewardClient: apiKey or bearerToken required");
		}
		if (!config.tenantId) {
			throw new Error("StewardClient: tenantId required");
		}
		this.baseUrl = (config.baseUrl || STEWARD_DEFAULT_BASE_URL).replace(/\/+$/, "");
		this.apiKey = config.apiKey;
		this.bearerToken = config.bearerToken;
		this.tenantId = config.tenantId;
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
	}

	/**
	 * Provision a new agent wallet under this tenant. Idempotent-ish: if an
	 * agent with `agentId` already exists, Steward will error — callers should
	 * `getAgent` first if they expect the record to potentially exist.
	 */
	async createWallet(agentId: string, name: string, platformId?: string): Promise<StewardAgentIdentity> {
		return this.request<StewardAgentIdentity>("POST", "/agents", {
			id: agentId,
			name,
			platformId,
		});
	}

	async getAgent(agentId: string): Promise<StewardAgentIdentity> {
		return this.request<StewardAgentIdentity>("GET", `/agents/${encodeURIComponent(agentId)}`);
	}

	async signMessage(agentId: string, message: string): Promise<StewardSignMessageResult> {
		return this.request<StewardSignMessageResult>("POST", `/vault/${encodeURIComponent(agentId)}/sign-message`, {
			message,
		});
	}

	async signTransaction(agentId: string, input: StewardSignTxInput): Promise<StewardSignTxResult> {
		return this.request<StewardSignTxResult>("POST", `/vault/${encodeURIComponent(agentId)}/sign`, input, {
			acceptPending: true,
		});
	}

	/** Read the agent's trading-policy caps (spend caps, leverage, allow-lists). */
	async getPolicy(agentId: string): Promise<StewardPolicyCaps> {
		return this.request<StewardPolicyCaps>("GET", `/v1/agents/${encodeURIComponent(agentId)}/policy`);
	}

	/** Replace the agent's trading-policy caps. Owner/patron-gated on Steward. */
	async putPolicy(agentId: string, caps: StewardPolicyCaps): Promise<StewardPolicyCaps> {
		return this.request<StewardPolicyCaps>("PUT", `/v1/agents/${encodeURIComponent(agentId)}/policy`, caps);
	}

	/** Read the agent's policy rules (incl. the approved-addresses withdraw whitelist). */
	async getPolicies(agentId: string): Promise<StewardPolicyRule[]> {
		const res = await this.request<StewardPolicyRule[] | { policies?: StewardPolicyRule[] }>(
			"GET",
			`/v1/agents/${encodeURIComponent(agentId)}/policies`,
		);
		if (Array.isArray(res)) return res;
		return res?.policies ?? [];
	}

	/** Replace the agent's policy rules. Owner/patron-gated on Steward. */
	async putPolicies(agentId: string, rules: StewardPolicyRule[]): Promise<StewardPolicyRule[]> {
		const res = await this.request<StewardPolicyRule[] | { policies?: StewardPolicyRule[] }>(
			"PUT",
			`/v1/agents/${encodeURIComponent(agentId)}/policies`,
			{ policies: rules },
		);
		if (Array.isArray(res)) return res;
		return res?.policies ?? rules;
	}

	/**
	 * Find-or-create an agent. Returns an existing record with the same id,
	 * otherwise creates a new one. Swallows 409/"already exists" errors.
	 */
	async ensureAgent(agentId: string, name: string, platformId?: string): Promise<StewardAgentIdentity> {
		try {
			return await this.getAgent(agentId);
		} catch (err) {
			if (err instanceof StewardError && err.status === 404) {
				// fall through to create
			} else if (err instanceof StewardError && err.status >= 400 && err.status < 500) {
				// some servers return 400/403 on missing agent — still try create
			} else {
				throw err;
			}
		}
		try {
			return await this.createWallet(agentId, name, platformId);
		} catch (err) {
			if (err instanceof StewardError && (err.status === 409 || err.status === 400)) {
				// race with a concurrent caller — fetch the existing record
				return this.getAgent(agentId);
			}
			throw err;
		}
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		opts: { acceptPending?: boolean } = {},
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		let response: Response;
		const init: RequestInit = {
			method,
			headers: this.buildHeaders(),
		};
		if (body !== undefined) {
			init.body = JSON.stringify(body);
		}
		try {
			response = await this.fetchImpl(url, init);
		} catch (err) {
			throw new StewardError(err instanceof Error ? err.message : "Steward network error", 0);
		}

		const payload = await this.parseJson(response);

		// Steward's wrapper: { ok, data?, error? }
		if (payload && typeof payload === "object" && "ok" in (payload as Record<string, unknown>)) {
			const wrapped = payload as { ok: boolean; data?: T; error?: string };
			if (wrapped.ok) {
				return wrapped.data as T;
			}
			if (opts.acceptPending && response.status === 202) {
				// pending approval lives in `data`
				return (wrapped.data ?? wrapped) as T;
			}
			throw new StewardError(
				wrapped.error ?? `Steward ${method} ${path} failed (${response.status})`,
				response.status,
				wrapped,
			);
		}

		if (!response.ok) {
			throw new StewardError(`Steward ${method} ${path} failed (${response.status})`, response.status, payload);
		}
		return payload as T;
	}

	private buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
			"X-Steward-Tenant": this.tenantId,
		};
		// Prefer the pre-minted bearer (cross-tenant) when present; otherwise fall
		// back to the tenant-scoped API key.
		if (this.bearerToken) {
			headers.Authorization = `Bearer ${this.bearerToken}`;
		} else if (this.apiKey) {
			headers["X-Steward-Key"] = this.apiKey;
		}
		return headers;
	}

	private async parseJson(response: Response): Promise<unknown> {
		const text = await response.text();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch {
			throw new StewardError(`Steward returned non-JSON (status ${response.status})`, response.status, {
				body: text.slice(0, 500),
			});
		}
	}
}

export function isPendingApproval(result: StewardSignTxResult): result is StewardPendingApproval {
	return (
		typeof result === "object" &&
		result !== null &&
		"status" in result &&
		(result as { status?: string }).status === "pending_approval"
	);
}

export function isBroadcastResult(result: StewardSignTxResult): result is StewardSignTxBroadcastResult {
	return (
		typeof result === "object" &&
		result !== null &&
		"txHash" in result &&
		typeof (result as StewardSignTxBroadcastResult).txHash === "string"
	);
}

export function createStewardClient(config: StewardConfig): StewardClient {
	return new StewardClient(config);
}
