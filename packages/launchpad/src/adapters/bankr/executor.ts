/**
 * Bankr (Base / Doppler) launch executor.
 *
 * This is the bankr equivalent of the BSC orchestrator's `broadcastPrepared`:
 * it takes a prepared launch plan (built by `bankrAdapter.buildCreateTokenTx`)
 * and performs the REAL deploy against Bankr's token-launch API
 * (`POST https://api.bankr.bot/token-launches/deploy`), parses the response into
 * a `{ tokenAddress, poolId, txHash }` result, and returns it so the route can
 * persist it onto the persona (same tables the BSC path writes).
 *
 * Auth model (env-gated):
 *   - `X-API-Key`     -> the Bankr user API key (`bk_...`), required.
 *   - `X-Partner-Key` -> optional partner key that routes a share of the
 *     on-chain trading fees to the partner. When present, Bankr takes the
 *     partner's cut out of its own 36.1% slice (creator stays 57%).
 *
 * Fee model (no waifu contract): tokens launch with a 1.2% swap fee split
 * Creator 57% / Bankr 36.1% / Ecosystem 1.9% / Protocol(Doppler) 5%. The split
 * is enforced by Doppler/Bankr on-chain; we do NOT deploy a waifu fee splitter
 * for Base. `feeRecipient` designates where the creator's 57% accrues.
 *
 * The deploy response shape is not fully documented publicly, so the parser is
 * defensive: it accepts the documented `tokenAddress`/`poolId` fields and the
 * common alternates (`contractAddress`, `poolAddress`, `transactionHash`,
 * `txHash`). If Bankr returns a job id instead of a synchronous result, we poll
 * the status endpoint until a token address resolves or we time out.
 */

import { getAddress, isAddress } from "viem";

import type { BankrExternalPlan } from "../../types.js";

export interface BankrExecutorConfig {
	/** Bankr user API key (`bk_...`). Sent as `X-API-Key`. Required. */
	apiKey: string;
	/** Optional Bankr partner key. Sent as `X-Partner-Key`. */
	partnerKey?: string;
	/** Base URL override (defaults to the plan's baseUrl). */
	baseUrl?: string;
	/** Injected fetch for tests. */
	fetchImpl?: typeof fetch;
	/** Total time to wait for a job-based deploy to resolve (ms). Default 120s. */
	pollTimeoutMs?: number;
	/** Poll interval for job-based deploys (ms). Default 3s. */
	pollIntervalMs?: number;
	/** Hook for structured logging. Secrets are never passed in. */
	onStep?: (step: string, detail: Record<string, unknown>) => void;
}

export interface BankrLaunchResult {
	tokenAddress: string;
	/** Doppler pool id / pool address. */
	poolId: string;
	/** Deploy tx hash, if Bankr returned one. */
	txHash?: string;
	/** Raw response for debugging / persistence. */
	raw: unknown;
}

export class BankrExecutorError extends Error {
	constructor(
		readonly step: string,
		message: string,
		readonly detail?: unknown,
	) {
		super(message);
		this.name = "BankrExecutorError";
	}
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

/** Pull the first string field that looks like an EVM address from a set of keys. */
function pickAddress(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && isAddress(value)) return getAddress(value);
	}
	return undefined;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

/**
 * Walk the (possibly nested) deploy response and resolve a launch result.
 * Bankr wraps the result under different keys across surfaces (`data`,
 * `result`, `launch`, `tokenLaunch`), so we probe the top level + one nesting.
 */
function parseDeployResponse(body: unknown): BankrLaunchResult | null {
	const candidates: JsonRecord[] = [];
	const top = asRecord(body);
	if (top) {
		candidates.push(top);
		for (const key of ["data", "result", "launch", "tokenLaunch", "response"]) {
			const nested = asRecord(top[key]);
			if (nested) candidates.push(nested);
		}
	}
	for (const record of candidates) {
		const tokenAddress = pickAddress(record, ["tokenAddress", "contractAddress", "token", "address"]);
		const poolId = pickString(record, ["poolId", "poolAddress", "pool", "poolKey", "dopplerPoolId"]);
		if (tokenAddress && poolId) {
			const txHash = pickString(record, ["txHash", "transactionHash", "deployTxHash", "hash"]);
			return { tokenAddress, poolId, ...(txHash ? { txHash } : {}), raw: body };
		}
	}
	return null;
}

function extractJobId(body: unknown): string | undefined {
	const record = asRecord(body);
	if (!record) return undefined;
	return pickString(record, ["jobId", "id", "launchId", "deployId"]);
}

function buildHeaders(config: BankrExecutorConfig): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-API-Key": config.apiKey,
	};
	if (config.partnerKey) headers["X-Partner-Key"] = config.partnerKey;
	return headers;
}

/**
 * Execute a prepared Bankr launch plan against the real Bankr API.
 *
 * Mirrors `AgentLaunchOrchestrator.broadcastPrepared`: take the prepared plan,
 * perform the chain-side action (here: the API deploy), parse the result.
 */
export async function executeBankrLaunch(
	plan: BankrExternalPlan,
	config: BankrExecutorConfig,
): Promise<BankrLaunchResult> {
	if (plan.kind !== "bankr") {
		throw new BankrExecutorError("validate", "executeBankrLaunch requires a bankr launch plan");
	}
	if (!config.apiKey) {
		throw new BankrExecutorError("auth", "BANKR_API_KEY is required to execute a Bankr launch");
	}
	if (plan.simulateOnly) {
		throw new BankrExecutorError(
			"validate",
			"refusing to execute a simulateOnly plan as a real launch; rebuild the plan with simulateOnly=false",
		);
	}

	const fetchImpl = config.fetchImpl ?? fetch;
	const baseUrl = config.baseUrl ?? plan.baseUrl;
	const url = `${baseUrl}${plan.endpoint}`;
	const headers = buildHeaders(config);

	config.onStep?.("bankr.deploy.request", {
		url,
		tokenName: plan.body.tokenName,
		tokenSymbol: plan.body.tokenSymbol,
		hasPartnerKey: Boolean(config.partnerKey),
	});

	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: plan.method,
			headers,
			body: JSON.stringify({ ...plan.body, simulateOnly: false }),
		});
	} catch (err) {
		throw new BankrExecutorError("bankr.deploy", `network error calling Bankr deploy: ${stringifyError(err)}`, err);
	}

	const text = await res.text();
	const body = safeJson(text);
	if (!res.ok) {
		throw new BankrExecutorError("bankr.deploy", `Bankr deploy failed (HTTP ${res.status})`, body ?? text);
	}

	const direct = parseDeployResponse(body);
	if (direct) {
		config.onStep?.("bankr.deploy.resolved", { tokenAddress: direct.tokenAddress, poolId: direct.poolId });
		return direct;
	}

	// Job-based deploy: poll the status endpoint until a token address resolves.
	const jobId = extractJobId(body);
	if (!jobId) {
		throw new BankrExecutorError(
			"bankr.deploy.parse",
			"Bankr deploy response had neither a token address nor a job id",
			body,
		);
	}
	config.onStep?.("bankr.deploy.polling", { jobId });
	return pollBankrJob(jobId, { ...config, baseUrl }, fetchImpl, headers);
}

async function pollBankrJob(
	jobId: string,
	config: BankrExecutorConfig & { baseUrl: string },
	fetchImpl: typeof fetch,
	headers: Record<string, string>,
): Promise<BankrLaunchResult> {
	const timeout = config.pollTimeoutMs ?? 120_000;
	const interval = config.pollIntervalMs ?? 3_000;
	const deadline = Date.now() + timeout;
	// Bankr surfaces job status under a couple of paths; try the launch-specific
	// one first, then the generic agent-job endpoint.
	const statusPaths = [`/token-launches/${jobId}`, `/agent/job/${jobId}`];

	while (Date.now() < deadline) {
		for (const path of statusPaths) {
			let res: Response;
			try {
				res = await fetchImpl(`${config.baseUrl}${path}`, { method: "GET", headers });
			} catch {
				continue;
			}
			if (!res.ok) continue;
			const body = safeJson(await res.text());
			const resolved = parseDeployResponse(body);
			if (resolved) {
				config.onStep?.("bankr.deploy.resolved", {
					tokenAddress: resolved.tokenAddress,
					poolId: resolved.poolId,
					jobId,
				});
				return resolved;
			}
			const status = readStatus(body);
			if (status === "failed" || status === "cancelled") {
				throw new BankrExecutorError("bankr.deploy.poll", `Bankr launch job ${jobId} ended as ${status}`, body);
			}
		}
		await sleep(interval);
	}
	throw new BankrExecutorError("bankr.deploy.poll", `Bankr launch job ${jobId} did not resolve within ${timeout}ms`);
}

function readStatus(body: unknown): string | undefined {
	const record = asRecord(body);
	if (!record) return undefined;
	const status = record.status ?? asRecord(record.data)?.status;
	return typeof status === "string" ? status.toLowerCase() : undefined;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function stringifyError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
