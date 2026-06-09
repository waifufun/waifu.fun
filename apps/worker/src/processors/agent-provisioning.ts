import type { Job } from "bullmq";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { isAddress } from "viem";

import { agentPersonaQueries, agentPersonas, agentWallets, agents, tokens } from "@waifufun/db";
import { type AgentProvisioningJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext, WorkerProcessor } from "../lib/types.js";

interface ElizaProvisionResult {
	agentId: string;
	cloudAgentId: string;
	containerId?: string;
	containerUrl?: string;
	webUiUrl?: string;
	jobId?: string;
	status: string;
	walletProvisioning?: Record<string, unknown> | null;
	account?: Record<string, unknown> | null;
	polling?: unknown;
}

export function createAgentProvisioningProcessor(context: WorkerContext): WorkerProcessor {
	return async (job: Job) => {
		const payload = parseJobPayload("agent-provisioning", job.data) as AgentProvisioningJob;

		try {
			const result = await provision(context, payload);
			await emitAgentEvent({
				db: context.db,
				agentId: payload.agentId,
				eventType: "agent.provisioned",
				data: {
					runtimeKind: "eliza-cloud",
					runtimeAgentId: result.cloudAgentId,
					containerId: result.containerId ?? null,
					containerUrl: result.containerUrl ?? null,
					webUiUrl: result.webUiUrl ?? null,
					jobId: result.jobId ?? null,
					status: result.status,
					account: result.account ?? null,
					polling: result.polling ?? null,
					retryJobId: job.id ?? null,
				},
			});
			return result;
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			if (isFinalAttempt(job)) {
				await emitAgentEvent({
					db: context.db,
					agentId: payload.agentId,
					eventType: "agent.provisioning_dead_letter",
					data: { error, attempts: (job.attemptsMade ?? 0) + 1, retryJobId: job.id ?? null },
				});
			}
			throw err;
		}
	};
}

function isFinalAttempt(job: Job): boolean {
	const attemptsMade = job.attemptsMade ?? 0;
	const configuredAttempts = typeof job.opts?.attempts === "number" && job.opts.attempts > 0 ? job.opts.attempts : 3;
	return attemptsMade + 1 >= configuredAttempts;
}

async function provision(context: WorkerContext, payload: AgentProvisioningJob): Promise<ElizaProvisionResult> {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(context.db, payload.agentId);
	if (!persona) throw new Error(`agent persona not found for ${payload.agentId}`);

	// Idempotency guard (develop). Provisioning is enqueued at token-create AND
	// again at DEX graduation (launched-to-dex / liquidity-added). If this persona
	// already has fully-provisioned cloud runtime metadata, the container exists,
	// so we short-circuit and return the stored result instead of POSTing
	// /api/v1/agents a second time (which would create a duplicate container +
	// duplicate billing).
	const existing = existingProvisionResult(payload.agentId, persona.metadata);
	if (existing) {
		context.logger.info(
			{ agentId: payload.agentId, cloudAgentId: existing.cloudAgentId },
			"agent already has Eliza Cloud runtime metadata; skipping duplicate provisioning",
		);
		return existing;
	}

	const [wallet] = await context.db
		.select({ walletAddress: agentWallets.walletAddress })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, persona.agentId))
		.limit(1);

	const tokenAddress =
		stringField(payload.data, "tokenContractAddress") ??
		stringField(payload.data, "tokenAddress") ??
		persona.tokenAddress;
	if (!tokenAddress) throw new Error("token address is required for Eliza Cloud container provisioning");

	const baseUrl = (
		process.env.ELIZA_CLOUD_BASE_URL ??
		process.env.ELIZA_API_URL ??
		"https://api.elizacloud.ai"
	).replace(/\/+$/, "");
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey =
		process.env.ELIZA_CLOUD_API_KEY ??
		process.env.ELIZAOS_CLOUD_API_KEY ??
		process.env.ELIZAOS_API_KEY ??
		process.env.ELIZACLOUD_API_KEY;
	const authKey = serviceKey ?? apiKey;
	if (!authKey)
		throw new Error(
			"ELIZA_CLOUD_SERVICE_KEY, ELIZAOS_CLOUD_API_KEY, or ELIZA_CLOUD_API_KEY is required for Eliza Cloud provisioning",
		);

	const chain = stringField(payload.data, "chain") ?? persona.chain ?? "bsc";
	const chainId = numberField(payload.data, "chainId") ?? Number.parseInt(process.env.CHAIN_ID ?? "56", 10);
	const tokenName =
		stringField(payload.data, "tokenName") ??
		stringField(payload.data, "name") ??
		tokenParam(persona.prelaunchParams, "name") ??
		persona.name;
	const tokenTicker =
		stringField(payload.data, "tokenTicker") ??
		stringField(payload.data, "symbol") ??
		tokenParam(persona.prelaunchParams, "symbol") ??
		persona.agentId.slice(0, 10).toUpperCase();

	const partialCloudAgentId = partialExistingCloudAgentId(persona.metadata);
	if (partialCloudAgentId) {
		context.logger.info(
			{ agentId: payload.agentId, cloudAgentId: partialCloudAgentId },
			"agent has partial Eliza Cloud runtime metadata; polling existing runtime",
		);
		const refreshedCloudAgent = await waitForRuntimeStatus(baseUrl, authKey, partialCloudAgentId, {
			cloudAgentId: partialCloudAgentId,
			status: "pending",
		});
		const result = normalizeProvisionResult(
			payload.agentId,
			partialCloudAgentId,
			refreshedCloudAgent,
			refreshedCloudAgent,
		);
		await storeProvisioningMetadata(context, payload.agentId, result);
		await syncTokenRuntimeOverlay(context, {
			tokenAddress,
			tokenName,
			tokenTicker,
			persona,
			result,
		});
		assertHostedChatUrlReady(result);
		return result;
	}

	const imageUri = stringField(payload.data, "containerImageUri") ?? process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
	if (!imageUri)
		throw new Error("ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI is required for Eliza Cloud container provisioning");
	const primaryWalletAddress =
		stringField(payload.data, "primaryWalletAddress") ??
		stringField(payload.data, "agentWalletAddress") ??
		stringField(payload.data, "walletAddress") ??
		wallet?.walletAddress ??
		null;
	if (!primaryWalletAddress) {
		throw new Error(`agent EVM wallet is required for Eliza Cloud provisioning (${payload.agentId})`);
	}
	if (!isAddress(primaryWalletAddress) || primaryWalletAddress === "0x0000000000000000000000000000000000000000") {
		throw new Error(
			`agent EVM wallet must be a valid non-zero EVM address for Eliza Cloud provisioning (${payload.agentId})`,
		);
	}
	const walletKeyRef =
		stringField(payload.data, "walletKeyRef") ??
		stringField(payload.data, "agentWalletKeyRef") ??
		`steward:${payload.agentId}`;
	const adminWallets = stringArrayField(payload.data, "adminWallets");
	const fallbackAdminWallet = persona.ownerAddress ?? null;
	const access = {
		guestMinTokens: numberField(payload.data, "guestMinTokens") ?? 1_000,
		userMinTokens: numberField(payload.data, "userMinTokens") ?? 100_000,
		thresholdMode: "strict_gt",
		adminWallets: (adminWallets.length > 0 ? adminWallets : fallbackAdminWallet ? [fallbackAdminWallet] : [])
			.map((wallet) => wallet.trim())
			.filter(Boolean),
	};
	const invalidAdminWallet = access.adminWallets.find((wallet) => !isAddress(wallet));
	if (invalidAdminWallet) {
		throw new Error(`admin wallet must be a valid EVM address for Eliza Cloud provisioning (${payload.agentId})`);
	}
	const billing = {
		mode: "owner_credits",
		initialReserveUsd: numberField(payload.data, "initialReserveUsd") ?? 5,
	};
	const modelDefaults = defaultHostedModelSettings();
	const webhookUrl = defaultElizaCloudWebhookUrl();
	const webhookSecret = webhookUrl ? defaultElizaCloudWebhookSecret() : undefined;
	const containerProjectName = stringField(payload.data, "containerProjectName");
	const containerPort = numberField(payload.data, "containerPort");
	const containerCpu = numberField(payload.data, "containerCpu");
	const containerMemory = numberField(payload.data, "containerMemory");
	const containerDesiredCount = numberField(payload.data, "containerDesiredCount");
	const containerArchitecture = containerArchitectureField(payload.data, "containerArchitecture");
	const containerHealthCheckPath = stringField(payload.data, "containerHealthCheckPath");
	const containerEnvironmentVars =
		stringRecordField(payload.data, "containerEnvironmentVars") ?? stringRecordField(payload.data, "containerEnv");
	// Per-inference burn metering: the launch-time provisioning path (token-create)
	// also has to inject the inference receiver URL plus the shared webhook secret,
	// otherwise containers launched here boot without the metering knobs the
	// plugin-elizacloud bridge reads and emit no inference.spent events. This
	// mirrors the API ElizaClient.provisionWaifuAgent path so both launch routes
	// produce metered containers.
	const inferenceWebhookUrl = defaultElizaCloudInferenceWebhookUrl();
	const inferenceWebhookSecret = webhookSecret ?? defaultElizaCloudWebhookSecret();

	const containerEnv = {
		// Sol conflict-resolution (#896): emit BOTH the legacy WAIFU_AGENT_ID and the
		// renamed ELIZA_BILLING_AGENT_ID to the same value (forward-compatible; the
		// runtime currently reads neither).
		WAIFU_AGENT_ID: payload.agentId,
		ELIZA_BILLING_AGENT_ID: payload.agentId,
		TOKEN_CONTRACT_ADDRESS: tokenAddress,
		TOKEN_CHAIN: chain,
		TOKEN_CHAIN_ID: String(chainId),
		TOKEN_NAME: tokenName,
		TOKEN_TICKER: tokenTicker,
		WAIFU_BILLING_MODE: billing.mode,
		WAIFU_INITIAL_CREDIT_USD: String(billing.initialReserveUsd),
		WAIFU_ACCESS_GUEST_MIN_TOKENS: String(access.guestMinTokens),
		WAIFU_ACCESS_USER_MIN_TOKENS: String(access.userMinTokens),
		WAIFU_ACCESS_THRESHOLD_MODE: "strict_gt",
		WAIFU_ACCESS_ADMIN_WALLETS: access.adminWallets.join(","),
		WAIFU_AGENT_EVM_ADDRESS: primaryWalletAddress,
		WAIFU_AGENT_EVM_KEY_REF: walletKeyRef,
		...(process.env.WAIFU_CHAT_ACCESS_JWT_SECRET
			? { WAIFU_CHAT_ACCESS_JWT_SECRET: process.env.WAIFU_CHAT_ACCESS_JWT_SECRET }
			: {}),
		...(process.env.WAIFU_CHAT_FRAME_ANCESTORS
			? { WAIFU_CHAT_FRAME_ANCESTORS: process.env.WAIFU_CHAT_FRAME_ANCESTORS }
			: {}),
		// Sol conflict-resolution (#896): keep BOTH develop's WAIFU_* webhook env vars
		// AND #896's ELIZA_BILLING_* names pointing at the same values.
		...(webhookUrl ? { WAIFU_WEBHOOK_URL: webhookUrl } : {}),
		...(inferenceWebhookUrl ? { WAIFU_INFERENCE_WEBHOOK_URL: inferenceWebhookUrl } : {}),
		...(inferenceWebhookSecret ? { WAIFU_WEBHOOK_SECRET: inferenceWebhookSecret } : {}),
		...(webhookUrl ? { ELIZA_BILLING_WEBHOOK_URL: webhookUrl } : {}),
		...(webhookSecret ? { ELIZA_BILLING_WEBHOOK_SECRET: webhookSecret } : {}),
		...modelDefaults,
		...(containerEnvironmentVars ?? {}),
		ELIZA_UI_ENABLE: "true",
	};

	// Atomic claim, taken only after all validation passes and immediately before
	// the container-creating POST. The duplicate-skip + partial-polling paths above
	// are serial-queue optimizations, but they are check-then-act and race if the
	// provisioning worker is ever scaled past one replica (token-create and
	// graduation jobs can run on different replicas concurrently, both seeing an
	// empty runtime). The claim is a single conditional UPDATE: only one caller
	// wins, so at most one /api/v1/agents POST happens per persona regardless of
	// replica count. A loser either returns the already-provisioned result or
	// refuses. Claiming here (not earlier) preserves the invariant that no DB write
	// happens before a valid wallet is resolved.
	const claimed = await claimProvisioning(context, payload.agentId);
	if (!claimed) {
		const refreshed = await agentPersonaQueries.getAgentPersonaByAgentId(context.db, payload.agentId);
		const refreshedExisting = refreshed ? existingProvisionResult(payload.agentId, refreshed.metadata) : null;
		if (refreshedExisting) {
			return refreshedExisting;
		}
		// Another in-flight provision holds the claim but has not stored a cloud id
		// yet. Refuse rather than POST a duplicate; the winning job finishes the
		// provision and a later enqueue (if any) reconciles.
		throw new Error(`agent provisioning already in progress for ${payload.agentId}`);
	}

	let cloudAgent: Record<string, unknown>;
	try {
		cloudAgent = await requestJson<Record<string, unknown>>(baseUrl, "/api/v1/agents", authKey, {
			method: "POST",
			body: {
				tokenContractAddress: tokenAddress,
				chain,
				chainId,
				tokenName,
				tokenTicker,
				launchType: launchTypeField(payload.data, "launchType") ?? "native",
				character: {
					name: tokenName,
					...(persona.bio ? { bio: persona.bio } : {}),
					config: {
						waifuAgentId: payload.agentId,
						account: {
							primaryWalletAddress,
							walletKeyRef,
						},
					},
				},
				billing,
				account: {
					primaryWalletAddress,
					chainType: "evm",
					walletKeyRef,
				},
				access: {
					guestTokenThreshold: access.guestMinTokens,
					userTokenThreshold: access.userMinTokens,
					adminWalletAddress: access.adminWallets[0],
					roles: {
						guest: { minTokens: access.guestMinTokens, comparison: "gt" },
						user: { minTokens: access.userMinTokens, comparison: "gt" },
						admin: { wallets: access.adminWallets },
					},
				},
				container: {
					image: imageUri,
					...(containerProjectName ? { projectName: containerProjectName } : {}),
					...(containerPort ? { port: containerPort } : {}),
					...(containerCpu ? { cpu: containerCpu } : {}),
					...(containerMemory ? { memory: containerMemory } : {}),
					...(containerDesiredCount ? { desiredCount: containerDesiredCount } : {}),
					...(containerArchitecture ? { architecture: containerArchitecture } : {}),
					...(containerHealthCheckPath ? { healthCheckPath: containerHealthCheckPath } : {}),
					env: containerEnv,
				},
				modelDefaults,
				...(webhookUrl ? { webhookUrl } : {}),
				...(webhookSecret ? { webhookSecret } : {}),
			},
		});
	} catch (err) {
		// Eliza Cloud may report a pre-existing agent for this token (409). That is
		// not a failure: adopt the existing runtime rather than POSTing a duplicate.
		const existingAgentId =
			err instanceof ElizaCloudRequestError && err.status === 409 ? stringField(err.body, "existingAgentId") : null;
		if (!existingAgentId) {
			// Release the atomic claim so a retry (or a later enqueue) can re-attempt
			// the provision. Best-effort: never mask the original failure.
			await releaseProvisioningClaim(context, payload.agentId).catch(() => {});
			throw err;
		}
		context.logger.warn(
			{ agentId: payload.agentId, cloudAgentId: existingAgentId },
			"Eliza Cloud already has an agent for this token; adopting existing runtime",
		);
		cloudAgent = {
			cloudAgentId: existingAgentId,
			status: "existing",
		};
	}
	const cloudAgentId =
		stringField(cloudAgent, "cloudAgentId") ?? stringField(cloudAgent, "agentId") ?? stringField(cloudAgent, "id");
	if (!cloudAgentId) {
		// Release the atomic claim before bailing so a retry can re-attempt.
		await releaseProvisioningClaim(context, payload.agentId).catch(() => {});
		throw new Error("Eliza Cloud agent response did not include an id");
	}
	const refreshedCloudAgent = await waitForRuntimeStatus(baseUrl, authKey, cloudAgentId, cloudAgent);
	const result = normalizeProvisionResult(payload.agentId, cloudAgentId, refreshedCloudAgent, cloudAgent);

	await storeProvisioningMetadata(context, payload.agentId, result);
	await syncTokenRuntimeOverlay(context, {
		tokenAddress,
		tokenName,
		tokenTicker,
		persona,
		result,
	});
	assertHostedChatUrlReady(result);
	return result;
}

async function requestJson<T>(
	baseUrl: string,
	path: string,
	authKey: string,
	options: {
		method?: "GET" | "POST";
		body?: Record<string, unknown>;
	},
): Promise<T> {
	const method = options.method ?? "GET";
	let response: Response;
	try {
		response = await fetch(`${baseUrl}${normalizeApiPath(baseUrl, path)}`, {
			method,
			headers: {
				"content-type": "application/json",
				"X-API-Key": authKey,
				"X-Service-Key": authKey,
			},
			signal: AbortSignal.timeout(elizaCloudRequestTimeoutMs()),
			...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError") {
			throw new ElizaCloudRequestTimeoutError(method, path, elizaCloudRequestTimeoutMs());
		}
		throw err;
	}
	const text = await response.text().catch(() => "");
	let json: unknown = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		// Keep the original response text in the request error below.
	}
	if (!response.ok) {
		throw new ElizaCloudRequestError(
			options.method ?? "GET",
			path,
			response.status,
			text,
			recordFromUnknown(json) ?? {},
		);
	}
	const responseRecord = recordFromUnknown(json);
	if (responseRecord?.success === false) throw new Error(String(responseRecord.error ?? "Unknown eliza-cloud error"));
	if (responseRecord && "success" in responseRecord && "data" in responseRecord) {
		return responseRecord.data as T;
	}
	return json as T;
}

class ElizaCloudRequestError extends Error {
	constructor(
		readonly method: string,
		readonly path: string,
		readonly status: number,
		readonly responseText: string,
		readonly body: Record<string, unknown>,
	) {
		super(`eliza-cloud ${method} ${path}: ${status} ${responseText}`);
	}
}

class ElizaCloudRequestTimeoutError extends Error {
	constructor(
		readonly method: string,
		readonly path: string,
		readonly timeoutMs: number,
	) {
		super(`eliza-cloud ${method} ${path}: timed out after ${timeoutMs}ms`);
		this.name = "ElizaCloudRequestTimeoutError";
	}
}

const DEFAULT_ELIZA_CLOUD_REQUEST_TIMEOUT_MS = 20_000;

function elizaCloudRequestTimeoutMs(): number {
	const configured = numberEnv("WAIFU_ELIZA_CLOUD_REQUEST_TIMEOUT_MS");
	return configured && configured > 0 ? configured : DEFAULT_ELIZA_CLOUD_REQUEST_TIMEOUT_MS;
}

async function waitForRuntimeStatus(
	baseUrl: string,
	authKey: string,
	cloudAgentId: string,
	initial: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const initialUrl = stringField(initial, "webUiUrl");
	const initialStatus = stringField(initial, "status");
	if (initialUrl && initialStatus && isHostedRuntimeRunning(initialStatus)) return initial;

	const attempts = numberEnv("WAIFU_ELIZA_PROVISION_STATUS_POLL_ATTEMPTS") ?? 18;
	// An explicit interval env pins a fixed cadence; otherwise we ramp from a
	// small initial delay up to the cap so a fast-booting container is detected
	// in ~1s instead of waiting a full fixed interval. Both bound time-to-live.
	const fixedIntervalMs = numberEnv("WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS");
	const maxIntervalMs = fixedIntervalMs ?? numberField(recordFromUnknown(initial.polling) ?? {}, "intervalMs") ?? 5_000;
	const initialIntervalMs = numberEnv("WAIFU_ELIZA_PROVISION_STATUS_POLL_INITIAL_MS") ?? Math.min(1_000, maxIntervalMs);
	let latest = initial;
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (attempt > 0) {
			const delayMs =
				fixedIntervalMs !== null ? fixedIntervalMs : adaptivePollDelayMs(attempt, initialIntervalMs, maxIntervalMs);
			if (delayMs > 0) await sleep(delayMs);
		}
		let status: Record<string, unknown>;
		try {
			status = await requestJson<Record<string, unknown>>(
				baseUrl,
				`/api/v1/agents/${encodeURIComponent(cloudAgentId)}/status`,
				authKey,
				{ method: "GET" },
			);
		} catch (err) {
			// A just-created runtime is transiently unqueryable (404) and the
			// status endpoint can blip (timeout / 5xx). Those are expected during
			// boot, so keep polling. Only auth/permission errors (401/403) mean a
			// misconfig that more polling can't fix — surface those immediately.
			if (isTransientStatusError(err)) continue;
			throw err;
		}
		latest = { ...latest, ...status };
		const publicUrl = stringField(latest, "webUiUrl");
		const runtimeUrl = publicUrl ?? stringField(latest, "containerUrl") ?? stringField(latest, "url");
		const runtimeStatus = stringField(latest, "status");
		if (publicUrl && runtimeUrl && runtimeStatus && isHostedRuntimeRunning(runtimeStatus)) return latest;
	}
	return latest;
}

function isTransientStatusError(err: unknown): boolean {
	if (err instanceof ElizaCloudRequestTimeoutError) return true;
	if (err instanceof ElizaCloudRequestError) return err.status === 404 || err.status >= 500;
	return false;
}

function normalizeApiPath(baseUrl: string, path: string): string {
	if (/\/api\/v1$/i.test(baseUrl) && path.startsWith("/api/v1/")) return path.slice("/api/v1".length);
	return path;
}

/** How long a provisioning claim is considered fresh before another worker may
 * reclaim it. Bounds the blast radius of a worker that crashes mid-provision
 * (after claiming but before storing the cloud id or releasing the claim). */
const PROVISIONING_CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * Atomically claim the right to provision this persona.
 *
 * A single conditional UPDATE sets `metadata.provisioning.claim` only when no
 * cloud agent exists yet AND no fresh claim is held. Postgres evaluates the
 * WHERE under row-level locking, so exactly one concurrent caller's UPDATE
 * matches and returns a row; all others match zero rows and lose. This makes
 * the guard correct even if the provisioning worker is scaled past one replica.
 *
 * Returns true if this caller won the claim, false otherwise.
 */
async function claimProvisioning(context: WorkerContext, agentId: string): Promise<boolean> {
	const now = new Date();
	const staleBefore = new Date(now.getTime() - PROVISIONING_CLAIM_TTL_MS).toISOString();
	const claimedAt = now.toISOString();
	const rows = await context.db
		.update(agentPersonas)
		.set({
			metadata: sql`
				jsonb_set(
					coalesce(${agentPersonas.metadata}, '{}'::jsonb),
					'{provisioning,claim}',
					jsonb_build_object('status', 'in_progress', 'claimedAt', ${claimedAt}::text),
					true
				)
			`,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentPersonas.agentId, agentId),
				isNull(agentPersonas.elizaCloudAgentId),
				or(
					sql`${agentPersonas.metadata} -> 'provisioning' -> 'claim' ->> 'status' IS DISTINCT FROM 'in_progress'`,
					sql`coalesce(${agentPersonas.metadata} -> 'provisioning' -> 'claim' ->> 'claimedAt', '') < ${staleBefore}`,
				),
			),
		)
		.returning({ agentId: agentPersonas.agentId });
	return rows.length > 0;
}

/**
 * Release a provisioning claim so a retry can re-attempt. Best-effort: only
 * clears the in_progress claim and only when no cloud agent has been stored.
 */
async function releaseProvisioningClaim(context: WorkerContext, agentId: string): Promise<void> {
	await context.db
		.update(agentPersonas)
		.set({
			metadata: sql`
				case
					when ${agentPersonas.metadata} ? 'provisioning'
					then jsonb_set(
						${agentPersonas.metadata},
						'{provisioning}',
						(${agentPersonas.metadata} -> 'provisioning') - 'claim',
						false
					)
					else ${agentPersonas.metadata}
				end
			`,
			updatedAt: new Date(),
		})
		.where(and(eq(agentPersonas.agentId, agentId), isNull(agentPersonas.elizaCloudAgentId)));
}

async function storeProvisioningMetadata(
	context: WorkerContext,
	agentId: string,
	result: ElizaProvisionResult,
): Promise<void> {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(context.db, agentId);
	if (!persona) return;
	const metadata = recordFromUnknown(persona.metadata) ?? {};
	const provisioning = recordFromUnknown(metadata.provisioning) ?? {};
	await context.db
		.update(agentPersonas)
		.set({
			runtimeKind: "eliza-cloud",
			elizaCloudAgentId: result.cloudAgentId,
			metadata: {
				...metadata,
				provisioning: {
					...provisioning,
					runtimeKind: "eliza-cloud",
					provider: "eliza-cloud",
					cloudAgentId: result.cloudAgentId,
					runtimeAgentId: result.cloudAgentId,
					containerId: result.containerId ?? null,
					containerUrl: result.containerUrl ?? null,
					webUiUrl: result.webUiUrl ?? null,
					status: result.status,
					walletProvisioning: result.walletProvisioning ?? null,
					account: result.account ?? null,
					polling: result.polling ?? null,
					updatedAt: new Date().toISOString(),
				},
			},
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, agentId));
}

async function syncTokenRuntimeOverlay(
	context: WorkerContext,
	args: {
		tokenAddress: string;
		tokenName: string;
		tokenTicker: string;
		persona: { name: string; bio: string | null; avatarUrl: string | null };
		result: ElizaProvisionResult;
	},
): Promise<void> {
	const [row] = await context.db
		.select({ token: tokens, agent: agents })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${args.tokenAddress})`)
		.limit(1);
	if (!row) return;

	const now = new Date();
	const isRunning = isHostedRuntimeRunning(args.result.status);
	const hasHostedChatUrl = Boolean(args.result.webUiUrl);
	const agentStatus = isRunning && hasHostedChatUrl ? "running" : "provisioning";
	const lifecycleState = isRunning && hasHostedChatUrl ? "live" : "birth";
	const agentValues = {
		name: args.tokenName,
		bio: args.persona.bio ?? null,
		avatarUrl: args.persona.avatarUrl ?? null,
		cloudAgentId: args.result.cloudAgentId,
		runtimeProvider: "eliza-cloud",
		agentStatus,
		lifecycleState,
		webUiUrl: args.result.webUiUrl ?? null,
		bridgeUrl: args.result.containerId ?? null,
		billingMode: "owner_credits",
		infraReserveUsd: "5",
		suspendedReason: null,
		updatedAt: now,
	};

	if (row.agent) {
		await context.db.update(agents).set(agentValues).where(eq(agents.id, row.agent.id));
		await context.db
			.update(tokens)
			.set({ agentId: row.agent.id, agentStatus, ownerClaimStatus: "claimed", updatedAt: now })
			.where(eq(tokens.id, row.token.id));
		return;
	}

	const [created] = await context.db
		.insert(agents)
		.values({ tokenId: row.token.id, ...agentValues })
		.returning({ id: agents.id });
	await context.db
		.update(tokens)
		.set({
			agentId: created?.id ?? row.token.agentId ?? null,
			agentStatus,
			ownerClaimStatus: "claimed",
			updatedAt: now,
		})
		.where(eq(tokens.id, row.token.id));
}

function defaultHostedModelSettings(): Record<string, string> {
	// Flip all hosted waifu model tiers with WAIFU_ELIZA_DEFAULT_MODEL.
	// BitRouter-verified interim default: anthropic/claude-haiku-4.5.
	// Frontier-open targets to re-test once routed: moonshotai/kimi-k2.6, z-ai/glm-5.1, deepseek/deepseek-v4-pro.
	const model =
		process.env.WAIFU_ELIZA_DEFAULT_MODEL ?? process.env.ELIZAOS_CLOUD_DEFAULT_MODEL ?? "anthropic/claude-haiku-4.5";
	return {
		ELIZAOS_CLOUD_SMALL_MODEL: model,
		ELIZAOS_CLOUD_MEDIUM_MODEL: model,
		ELIZAOS_CLOUD_LARGE_MODEL: model,
	};
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function defaultElizaCloudWebhookUrl(): string | undefined {
	const configured = stringEnv("ELIZA_CLOUD_WEBHOOK_URL") ?? stringEnv("WAIFU_ELIZA_CLOUD_WEBHOOK_URL");
	if (configured) return configured.replace(/\/+$/, "");
	const apiBase = stringEnv("WAIFU_API_BASE_URL") ?? stringEnv("API_ORIGIN") ?? stringEnv("NEXT_PUBLIC_API_URL");
	if (!apiBase) return undefined;
	return `${apiBase.replace(/\/+$/, "")}/v2/webhooks/eliza-cloud/credits`;
}

/**
 * The per-inference metering webhook the hosted container POSTs `inference.spent`
 * events to. Distinct from the credits webhook: this is the burn signal that
 * feeds the burn rollup. Defaults to the same API base with the `/inference`
 * receiver path; override with ELIZA_CLOUD_INFERENCE_WEBHOOK_URL when the
 * receiver lives elsewhere. Never reuses the credits URL, so inference events
 * can never be misclassified as credit events.
 */
function defaultElizaCloudInferenceWebhookUrl(): string | undefined {
	const configured =
		stringEnv("ELIZA_CLOUD_INFERENCE_WEBHOOK_URL") ?? stringEnv("WAIFU_ELIZA_CLOUD_INFERENCE_WEBHOOK_URL");
	if (configured) return configured.replace(/\/+$/, "");
	const apiBase = stringEnv("WAIFU_API_BASE_URL") ?? stringEnv("API_ORIGIN") ?? stringEnv("NEXT_PUBLIC_API_URL");
	if (!apiBase) return undefined;
	return `${apiBase.replace(/\/+$/, "")}/v2/webhooks/eliza-cloud/inference`;
}

function defaultElizaCloudWebhookSecret(): string | undefined {
	return stringEnv("ELIZA_CLOUD_WEBHOOK_SECRET") ?? stringEnv("WEBHOOK_RECEIVER_SECRET");
}

function stringEnv(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value ? value : undefined;
}

function numberField(data: Record<string, unknown>, key: string): number | null {
	const value = data[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function numberEnv(key: string): number | null {
	const value = process.env[key]?.trim();
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential ramp from initial to max, doubling each poll (1s → 2s → 4s → cap). */
export function adaptivePollDelayMs(attempt: number, initialMs: number, maxMs: number): number {
	if (initialMs <= 0) return Math.max(0, maxMs);
	const scaled = initialMs * 2 ** (attempt - 1);
	return Math.min(maxMs, scaled);
}

function stringArrayField(data: Record<string, unknown>, key: string): string[] {
	const value = data[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function stringRecordField(data: Record<string, unknown>, key: string): Record<string, string> | null {
	const value = recordFromUnknown(data[key]);
	if (!value) return null;
	const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
	return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function tokenParam(value: unknown, key: string): string | null {
	const record = recordFromUnknown(value);
	return record ? stringField(record, key) : null;
}

function launchTypeField(data: Record<string, unknown>, key: string): "native" | "imported" | null {
	const value = stringField(data, key);
	if (value === "native" || value === "imported") return value;
	return null;
}

function containerArchitectureField(data: Record<string, unknown>, key: string): "arm64" | "x86_64" | null {
	const value = stringField(data, key);
	if (value === "arm64" || value === "x86_64") return value;
	return null;
}

function isHostedRuntimeRunning(status: string): boolean {
	return ["running", "ready", "online", "active", "started"].includes(status.toLowerCase());
}

function assertHostedChatUrlReady(result: ElizaProvisionResult): void {
	if (result.webUiUrl) return;
	throw new HostedChatUrlNotReadyError(result.cloudAgentId);
}

class HostedChatUrlNotReadyError extends Error {
	constructor(cloudAgentId: string) {
		super(`Eliza Cloud hosted chat URL is not ready for ${cloudAgentId}; retrying provisioning status poll`);
		this.name = "HostedChatUrlNotReadyError";
	}
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function existingProvisionResult(agentId: string, metadata: unknown): ElizaProvisionResult | null {
	const provisioning = recordFromUnknown(recordFromUnknown(metadata)?.provisioning);
	if (!provisioning) return null;
	const cloudAgentId = stringField(provisioning, "cloudAgentId") ?? stringField(provisioning, "runtimeAgentId");
	if (!cloudAgentId) return null;
	const containerId = stringField(provisioning, "containerId") ?? undefined;
	const webUiUrl = stringField(provisioning, "webUiUrl") ?? undefined;
	const containerUrl = stringField(provisioning, "containerUrl") ?? undefined;
	if (!webUiUrl) {
		return null;
	}
	const walletProvisioning = recordFromUnknown(provisioning.walletProvisioning);
	const account = recordFromUnknown(provisioning.account);
	return {
		agentId,
		cloudAgentId,
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
		...(webUiUrl ? { webUiUrl } : {}),
		jobId: stringField(provisioning, "jobId") ?? cloudAgentId,
		status: stringField(provisioning, "status") ?? "running",
		...(walletProvisioning ? { walletProvisioning } : {}),
		...(account ? { account } : {}),
		polling: provisioning.polling ?? null,
	};
}

function partialExistingCloudAgentId(metadata: unknown): string | null {
	const provisioning = recordFromUnknown(recordFromUnknown(metadata)?.provisioning);
	if (!provisioning) return null;
	const cloudAgentId = stringField(provisioning, "cloudAgentId") ?? stringField(provisioning, "runtimeAgentId");
	if (!cloudAgentId) return null;
	const webUiUrl = stringField(provisioning, "webUiUrl");
	return webUiUrl ? null : cloudAgentId;
}

function normalizeProvisionResult(
	agentId: string,
	cloudAgentId: string,
	refreshedCloudAgent: Record<string, unknown>,
	cloudAgent: Record<string, unknown>,
): ElizaProvisionResult {
	const walletData =
		recordFromUnknown(refreshedCloudAgent.walletProvisioning) ?? recordFromUnknown(cloudAgent.walletProvisioning);
	const accountData = recordFromUnknown(refreshedCloudAgent.account) ?? recordFromUnknown(cloudAgent.account);
	const containerId =
		stringField(refreshedCloudAgent, "containerId") ?? stringField(cloudAgent, "containerId") ?? undefined;
	const webUiUrl = stringField(refreshedCloudAgent, "webUiUrl") ?? stringField(cloudAgent, "webUiUrl") ?? undefined;
	const containerUrl =
		stringField(refreshedCloudAgent, "containerUrl") ??
		stringField(refreshedCloudAgent, "url") ??
		stringField(cloudAgent, "containerUrl") ??
		undefined;
	const status = stringField(refreshedCloudAgent, "status") ?? stringField(cloudAgent, "status") ?? "pending";
	return {
		agentId,
		cloudAgentId,
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
		...(webUiUrl ? { webUiUrl } : {}),
		jobId: stringField(cloudAgent, "jobId") ?? stringField(refreshedCloudAgent, "jobId") ?? containerId ?? cloudAgentId,
		status,
		...(walletData ? { walletProvisioning: walletData } : {}),
		...(accountData ? { account: accountData } : {}),
		polling: cloudAgent.polling ?? null,
	};
}
