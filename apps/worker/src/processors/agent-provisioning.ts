import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";

import { agentPersonaQueries, agentPersonas, agentWallets, agents, tokens } from "@waifufun/db";
import { type AgentProvisioningJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext, WorkerProcessor } from "../lib/types.js";

interface ElizaProvisionResult {
	agentId: string;
	cloudAgentId: string;
	containerId?: string;
	containerUrl?: string;
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
			if ((job.attemptsMade ?? 0) >= 2) {
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

async function provision(context: WorkerContext, payload: AgentProvisioningJob): Promise<ElizaProvisionResult> {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(context.db, payload.agentId);
	if (!persona) throw new Error(`agent persona not found for ${payload.agentId}`);

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

	const baseUrl = (process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai").replace(
		/\/+$/,
		"",
	);
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

	const imageUri = stringField(payload.data, "containerImageUri") ?? process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
	if (!imageUri)
		throw new Error("ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI is required for Eliza Cloud container provisioning");

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
	const primaryWalletAddress =
		stringField(payload.data, "primaryWalletAddress") ??
		stringField(payload.data, "walletAddress") ??
		stringField(payload.data, "agentWalletAddress") ??
		wallet?.walletAddress ??
		null;
	if (!primaryWalletAddress) {
		throw new Error(`agent EVM wallet is required for Eliza Cloud provisioning (${payload.agentId})`);
	}
	const adminWallets = stringArrayField(payload.data, "adminWallets");
	const fallbackAdminWallet = persona.ownerAddress ?? null;
	const access = {
		guestMinTokens: numberField(payload.data, "guestMinTokens") ?? 1_000,
		userMinTokens: numberField(payload.data, "userMinTokens") ?? 100_000,
		thresholdMode: "strict_gt",
		adminWallets: adminWallets.length > 0 ? adminWallets : fallbackAdminWallet ? [fallbackAdminWallet] : [],
	};
	const billing = {
		mode: "owner_credits",
		initialReserveUsd: numberField(payload.data, "initialReserveUsd") ?? 5,
	};
	const modelDefaults = defaultHostedModelSettings();
	const webhookUrl = defaultElizaCloudWebhookUrl();
	const webhookSecret = webhookUrl ? defaultElizaCloudWebhookSecret() : undefined;

	const containerEnv = {
		WAIFU_AGENT_ID: payload.agentId,
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
		WAIFU_AGENT_EVM_KEY_REF: `steward:${payload.agentId}`,
		...(process.env.WAIFU_CHAT_ACCESS_JWT_SECRET
			? { WAIFU_CHAT_ACCESS_JWT_SECRET: process.env.WAIFU_CHAT_ACCESS_JWT_SECRET }
			: {}),
		...modelDefaults,
	};

	const cloudAgent = await requestJson<Record<string, unknown>>(baseUrl, "/api/v1/agents", authKey, {
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
					walletKeyRef: `steward:${payload.agentId}`,
				},
			},
		},
		billing,
		account: {
			primaryWalletAddress,
			chainType: "evm",
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
			env: containerEnv,
		},
		modelDefaults,
		...(webhookUrl ? { webhookUrl } : {}),
		...(webhookSecret ? { webhookSecret } : {}),
	});
	const cloudAgentId =
		stringField(cloudAgent, "cloudAgentId") ?? stringField(cloudAgent, "agentId") ?? stringField(cloudAgent, "id");
	if (!cloudAgentId) throw new Error("Eliza Cloud agent response did not include an id");
	const walletData = recordFromUnknown(cloudAgent.walletProvisioning);
	const accountData = recordFromUnknown(cloudAgent.account);
	const containerId = stringField(cloudAgent, "containerId") ?? undefined;
	const containerUrl = stringField(cloudAgent, "containerUrl") ?? undefined;
	const status = stringField(cloudAgent, "status") ?? "pending";
	const result: ElizaProvisionResult = {
		agentId: payload.agentId,
		cloudAgentId,
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
		jobId: stringField(cloudAgent, "jobId") ?? containerId ?? cloudAgentId,
		status,
		...(walletData ? { walletProvisioning: walletData } : {}),
		...(accountData ? { account: accountData } : {}),
		polling: cloudAgent.polling ?? null,
	};

	await storeProvisioningMetadata(context, payload.agentId, result);
	await syncTokenRuntimeOverlay(context, {
		tokenAddress,
		tokenName,
		tokenTicker,
		persona,
		result,
	});
	return result;
}

async function requestJson<T>(
	baseUrl: string,
	path: string,
	authKey: string,
	body: Record<string, unknown>,
): Promise<T> {
	const response = await fetch(`${baseUrl}${normalizeApiPath(baseUrl, path)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-API-Key": authKey,
			"X-Service-Key": authKey,
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`eliza-cloud POST ${path}: ${response.status} ${text}`);
	}
	const json = (await response.json()) as T | { success?: boolean; data?: T; error?: unknown };
	const responseRecord = recordFromUnknown(json);
	if (responseRecord?.success === false) throw new Error(String(responseRecord.error ?? "Unknown eliza-cloud error"));
	if (responseRecord && "success" in responseRecord && "data" in responseRecord) {
		return responseRecord.data as T;
	}
	return json as T;
}

function normalizeApiPath(baseUrl: string, path: string): string {
	if (/\/api\/v1$/i.test(baseUrl) && path.startsWith("/api/v1/")) return path.slice("/api/v1".length);
	return path;
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
	const agentStatus = args.result.status === "running" ? "running" : "provisioning";
	const lifecycleState = args.result.status === "running" ? "live" : "birth";
	const agentValues = {
		name: args.tokenName,
		bio: args.persona.bio ?? null,
		avatarUrl: args.persona.avatarUrl ?? null,
		cloudAgentId: args.result.cloudAgentId,
		runtimeProvider: "eliza-cloud",
		agentStatus,
		lifecycleState,
		webUiUrl: args.result.containerUrl ?? null,
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
	const model =
		process.env.WAIFU_ELIZA_DEFAULT_MODEL ?? process.env.ELIZAOS_CLOUD_DEFAULT_MODEL ?? "openai/gpt-oss-120b";
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

function stringArrayField(data: Record<string, unknown>, key: string): string[] {
	const value = data[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.length > 0);
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

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}
