import { Hono } from "hono";
import type { Context, Next } from "hono";

import {
	agentApps,
	agentPersonaQueries,
	agentPersonas,
	agentQueries,
	agentWallets,
	agents,
	creators,
	getDatabase,
	getSettlementMode,
	inviteCodes,
	inviteRedemptions,
	tokens,
} from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { isAddress } from "viem";

import { createKey } from "../../lib/agent-keys.js";
import { ensureAgentIdMatches, requireAgentAuth } from "../../middleware/agent-auth.js";
import { generateRuntimeApiKey, hashRuntimeApiKey } from "../../middleware/agent-pull-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import type { RequireAgentOwnershipBindings, RequirePatronBindings } from "../../middleware/patron-auth.js";

import { seedDefaultAdapterPolicies } from "../../services/agent-launch/default-adapter-policies.js";
import {
	AgentLaunchError,
	type AgentLaunchInput,
	FourMemeError,
	type OrchestratorDeps,
	type PersonaStore,
	createOrchestrator,
	createStewardClient,
} from "../../services/agent-launch/index.js";
import {
	type ElizaAgentRuntimeStatus,
	type ElizaCloudClient,
	type ElizaCloudProvisionResult,
	type ProvisionWaifuCloudAgentInput,
	createElizaCloudClient,
	resolveElizaCloudApiKey,
} from "../../services/eliza-client.js";
import { emitAgentEvent } from "../../services/events/emit.js";
import { buildTreasurySummary } from "../../services/nav/treasury-summary.js";
import {
	type PatronContext,
	type ProvisionAdapterConfig,
	validateProvisionRequest,
} from "../../services/provision/payload-adapter.js";

const app = new Hono<RequireAgentOwnershipBindings>();

// V2 agents routes

const VALID_STATUS = new Set(["active", "graduated", "failed", "pending"]);
const VALID_SORT = new Set(["newest", "volume_24h", "market_cap"]);

const DEFAULT_PROVISION_IMAGE_URL =
	process.env.DEFAULT_AGENT_IMAGE_URL ??
	"https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png";

export function parseIncludeLegacy(value: string | undefined): boolean {
	return value === "true";
}
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	if (agentsRouteDepsForTest.db) return agentsRouteDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function numericToNumber(value: string | number | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function metadataNumber(metadata: unknown, key: string): number | null {
	if (!metadata || typeof metadata !== "object" || !(key in metadata)) return null;
	const value = (metadata as Record<string, unknown>)[key];
	if (typeof value !== "number" && typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function metadataBoolean(metadata: unknown, key: string): boolean {
	if (!metadata || typeof metadata !== "object" || !(key in metadata)) return false;
	return (metadata as Record<string, unknown>)[key] === true;
}

type LaunchOrchestrator = ReturnType<typeof createOrchestrator>;

type AgentsRouteDepsForTest = {
	db: Database | undefined;
	createOrchestrator: (() => LaunchOrchestrator) | undefined;
	createAgentKey: typeof createKey | undefined;
	elizaCloudClient: Pick<ElizaCloudClient, "provisionWaifuAgent"> | undefined;
};

const agentsRouteDepsForTest: AgentsRouteDepsForTest = {
	db: undefined,
	createOrchestrator: undefined,
	createAgentKey: undefined,
	elizaCloudClient: undefined,
};

export function __setAgentsRouteDepsForTest(deps: Partial<AgentsRouteDepsForTest>): void {
	agentsRouteDepsForTest.db = deps.db;
	agentsRouteDepsForTest.createOrchestrator = deps.createOrchestrator;
	agentsRouteDepsForTest.createAgentKey = deps.createAgentKey;
	agentsRouteDepsForTest.elizaCloudClient = deps.elizaCloudClient;
}

function slugifyAgentId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return `waifu-${slug || "agent"}-${crypto.randomUUID().slice(0, 8)}`;
}

export function buildLaunchOrchestratorDeps(): OrchestratorDeps {
	const chainId = Number(process.env.FOURMEME_CHAIN_ID ?? 56);
	if (chainId !== 56 && chainId !== 97) {
		throw new Error("FOURMEME_CHAIN_ID must be 56 or 97");
	}
	const rpcUrl =
		process.env.BSC_RPC_URL ??
		(chainId === 56 ? "https://bsc-dataseed.binance.org" : "https://data-seed-prebsc-1-s1.binance.org:8545");
	const stewardBaseUrl = process.env.STEWARD_API_URL;
	const stewardApiKey = process.env.STEWARD_API_KEY;
	if (!stewardBaseUrl || !stewardApiKey) {
		throw new Error("STEWARD_API_URL and STEWARD_API_KEY env vars required");
	}
	const steward = createStewardClient({
		baseUrl: stewardBaseUrl,
		apiKey: stewardApiKey,
		tenantId: process.env.STEWARD_TENANT_ID ?? "waifu",
	});
	let personaStore: PersonaStore | undefined;
	const db = requireDb();
	if (db) {
		personaStore = {
			writeInitial: async (args) => {
				const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, args.agentId);
				const personaJson =
					args.persona && typeof args.persona === "object" ? (args.persona as Record<string, unknown>) : undefined;
				if (!existing) {
					const preset = personaJson && typeof personaJson.preset === "string" ? personaJson.preset : null;
					const systemPrompt =
						personaJson && typeof personaJson.systemPrompt === "string" ? personaJson.systemPrompt : null;
					const traits =
						personaJson && Array.isArray(personaJson.traits)
							? (personaJson.traits.filter((t: unknown) => typeof t === "string") as string[])
							: [];
					const twitterHandle =
						personaJson && typeof personaJson.twitterHandle === "string" ? personaJson.twitterHandle : null;
					const runtimeKind =
						personaJson?.runtimeKind === "webhook"
							? "third-party-webhook"
							: personaJson?.runtimeKind === "pull"
								? "third-party-pull"
								: "eliza-cloud";
					const persona = await agentPersonaQueries.createAgentPersona(db, {
						agentId: args.agentId,
						name: args.name,
						bio: args.bio ?? null,
						avatarUrl: args.avatarUrl ?? null,
						preset,
						systemPrompt,
						traits,
						twitterHandle,
						metadata: personaJson ?? null,
						ownerStewardUserId:
							personaJson && typeof personaJson.ownerStewardUserId === "string" ? personaJson.ownerStewardUserId : null,
						ownerAddress: personaJson && typeof personaJson.ownerAddress === "string" ? personaJson.ownerAddress : null,
						runtimeKind,
						runtimeWebhookUrl:
							personaJson && typeof personaJson.webhookUrl === "string" ? personaJson.webhookUrl : null,
						runtimeWebhookSecretHash:
							personaJson && typeof personaJson.runtimeWebhookSecretHash === "string"
								? personaJson.runtimeWebhookSecretHash
								: null,
					});
					await seedDefaultAdapterPolicies(db, persona);
				}
				await upsertLaunchAgentWallet(db, {
					agentId: args.agentId,
					walletAddress: args.walletAddress,
					safeAddress: args.taxVaultAddress ?? null,
					persona: personaJson ?? null,
				});
			},
			setToken: async (agentId, tokenAddress) => {
				await agentPersonaQueries.setTokenAddressOnPersona(db, agentId, tokenAddress);
				await db
					.update(agentWallets)
					.set({ agentToken: tokenAddress, updatedAt: new Date() })
					.where(eq(agentWallets.internalAgentId, agentId));
			},
			setIdentity: async (agentId, identity) => {
				await agentPersonaQueries.setPersonaIdentity(db, agentId, identity);
			},
		};
	}

	const deps: OrchestratorDeps = {
		steward,
		rpcUrl,
		chainId: chainId as 56 | 97,
		...(process.env.FOURMEME_API_URL ? { fourMemeBaseUrl: process.env.FOURMEME_API_URL } : {}),
		...(process.env.FOURMEME_TOKEN_MANAGER_2
			? { tokenManager2Address: process.env.FOURMEME_TOKEN_MANAGER_2 as `0x${string}` }
			: {}),
		...(process.env.TAX_SPLITTER_FACTORY_ADDRESS
			? { taxSplitterFactoryAddress: process.env.TAX_SPLITTER_FACTORY_ADDRESS as `0x${string}` }
			: {}),
		...(process.env.EIP8004_NFT_ADDRESS ? { eip8004NftAddress: process.env.EIP8004_NFT_ADDRESS as `0x${string}` } : {}),
		platformSlug: "waifu",
		...(personaStore ? { personaStore } : {}),
	};
	return deps;
}

function getOrCreateLaunchOrchestrator(): LaunchOrchestrator {
	if (agentsRouteDepsForTest.createOrchestrator) return agentsRouteDepsForTest.createOrchestrator();
	return createOrchestrator(buildLaunchOrchestratorDeps());
}

async function upsertLaunchAgentWallet(
	db: Database,
	args: {
		agentId: string;
		walletAddress: string;
		safeAddress: string | null;
		persona: Record<string, unknown> | null;
	},
): Promise<void> {
	const [existing] = await db
		.select({ id: agentWallets.id })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, args.agentId))
		.limit(1);

	const now = new Date();
	const values = {
		walletAddress: args.walletAddress,
		safeAddress: args.safeAddress,
		internalAgentId: args.agentId,
		stewardAgentId: args.agentId,
		stewardTenantId: process.env.STEWARD_TENANT_ID ?? "waifu",
		persona: args.persona,
		updatedAt: now,
	};

	if (existing) {
		await db.update(agentWallets).set(values).where(eq(agentWallets.id, existing.id));
		return;
	}

	await db.insert(agentWallets).values({
		...values,
		createdAt: now,
	});
}

function getConfiguredElizaCloudClient(): Pick<ElizaCloudClient, "provisionWaifuAgent"> | null {
	if (agentsRouteDepsForTest.elizaCloudClient) return agentsRouteDepsForTest.elizaCloudClient;
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey = resolveElizaCloudApiKey();
	if (!serviceKey && !apiKey) return null;
	return createElizaCloudClient({
		baseUrl,
		...(serviceKey ? { serviceKey } : {}),
		...(apiKey ? { apiKey } : {}),
		logger: console,
	});
}

function defaultHostedModelSettings(): Record<string, string> {
	const model =
		process.env.WAIFU_ELIZA_DEFAULT_MODEL ?? process.env.ELIZAOS_CLOUD_DEFAULT_MODEL ?? "openai/gpt-oss-120b";
	return {
		ELIZAOS_CLOUD_NANO_MODEL: model,
		ELIZAOS_CLOUD_SMALL_MODEL: model,
		ELIZAOS_CLOUD_MEDIUM_MODEL: model,
		ELIZAOS_CLOUD_LARGE_MODEL: model,
		ELIZAOS_CLOUD_MEGA_MODEL: model,
		ELIZAOS_CLOUD_RESPONSE_HANDLER_MODEL: model,
		ELIZAOS_CLOUD_SHOULD_RESPOND_MODEL: model,
		ELIZAOS_CLOUD_ACTION_PLANNER_MODEL: model,
		ELIZAOS_CLOUD_PLANNER_MODEL: model,
		ELIZAOS_CLOUD_RESPONSE_MODEL: model,
	};
}

function runtimeKindFromProvisionBody(
	body: import("../../services/provision/payload-adapter.js").ProvisionRequest,
): string {
	if (body.runtime.kind === "webhook") return "third-party-webhook";
	if (body.runtime.kind === "pull") return "third-party-pull";
	return "eliza-cloud";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cloudResponseFields(cloud: ElizaCloudProvisionResult) {
	return {
		cloudAgentId: cloud.cloudAgentId,
		containerId: cloud.containerId ?? null,
		containerUrl: cloud.containerUrl ?? null,
		webUiUrl: cloud.webUiUrl ?? null,
		cloudStatus: cloud.status,
		cloudJobId: cloud.jobId ?? null,
		cloudPolling: cloud.polling ?? null,
		cloudCharacterId: cloud.characterId ?? null,
		cloud: {
			provider: "eliza-cloud",
			agentId: cloud.cloudAgentId,
			containerId: cloud.containerId ?? null,
			containerUrl: cloud.containerUrl ?? null,
			webUiUrl: cloud.webUiUrl ?? null,
			status: cloud.status,
			jobId: cloud.jobId ?? null,
			polling: cloud.polling ?? null,
			characterId: cloud.characterId ?? null,
			account: cloud.account ?? null,
		},
	};
}

function buildCloudProvisionInput(args: {
	agentId: string;
	tokenAddress: string;
	walletAddress?: string | null;
	treasuryAddress: string | null;
	launchInput: AgentLaunchInput;
	body: import("../../services/provision/payload-adapter.js").ProvisionRequest;
}): ProvisionWaifuCloudAgentInput {
	const chainId = Number(process.env.FOURMEME_CHAIN_ID ?? process.env.BSC_CHAIN_ID ?? 56);
	const characterConfig = recordFromUnknown(args.launchInput.persona);
	return {
		agentId: args.agentId,
		tokenContractAddress: args.tokenAddress,
		chain: args.body.launchpad?.chain ?? "bsc",
		chainId: Number.isFinite(chainId) ? chainId : 56,
		tokenName: args.launchInput.name,
		tokenTicker: args.launchInput.symbol,
		launchType: "native",
		character: {
			name: args.launchInput.name,
			bio: args.launchInput.description,
			...(args.launchInput.imageUrl ? { avatar: args.launchInput.imageUrl } : {}),
			config: {
				...characterConfig,
				waifuAgentId: args.agentId,
				treasuryAddress: args.treasuryAddress,
				taxSplit: args.launchInput.taxSplit ?? null,
				launchpad: args.body.launchpad,
			},
		},
		billing: { mode: "owner_credits" },
		account: {
			primaryWalletAddress: args.walletAddress ?? null,
			walletKeyRef: args.walletAddress ? `steward:${args.agentId}` : null,
		},
		access: {
			guestMinTokens: 1_000,
			userMinTokens: 100_000,
			thresholdMode: "strict_gt",
			adminWallets: args.body.safe.owners,
		},
		modelDefaults: defaultHostedModelSettings(),
	};
}

async function mergeCloudProvisioningMetadata(
	db: Database,
	agentId: string,
	cloud: ElizaCloudProvisionResult,
): Promise<void> {
	const current = await agentPersonaQueries.getAgentPersonaByAgentId(db, agentId);
	if (!current) return;
	const metadata = recordFromUnknown(current.metadata);
	const provisioning = recordFromUnknown(metadata.provisioning);
	await db
		.update(agentPersonas)
		.set({
			runtimeKind: "eliza-cloud",
			elizaCloudAgentId: cloud.cloudAgentId,
			metadata: {
				...metadata,
				provisioning: {
					...provisioning,
					runtimeKind: "eliza-cloud",
					provider: "eliza-cloud",
					cloudAgentId: cloud.cloudAgentId,
					runtimeAgentId: cloud.cloudAgentId,
					containerId: cloud.containerId ?? null,
					containerUrl: cloud.containerUrl ?? null,
					webUiUrl: cloud.webUiUrl ?? null,
					characterId: cloud.characterId ?? null,
					jobId: cloud.jobId ?? null,
					status: cloud.status,
					account: cloud.account ?? null,
					walletProvisioning: cloud.walletProvisioning ?? null,
					polling: cloud.polling ?? null,
					modelDefaults: defaultHostedModelSettings(),
					updatedAt: new Date().toISOString(),
				},
			},
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, agentId));
}

async function syncTokenRuntimeOverlay(
	db: Database,
	args: {
		tokenAddress: string;
		launchInput: AgentLaunchInput;
		cloud: ElizaCloudProvisionResult;
	},
): Promise<void> {
	const [row] = await db
		.select({ token: tokens, agent: agents })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${args.tokenAddress})`)
		.limit(1);
	if (!row) return;

	const now = new Date();
	const hostedUrl = args.cloud.webUiUrl ?? null;
	const isRunning = isHostedRuntimeRunning(args.cloud.status) && Boolean(hostedUrl);
	const agentStatus = isRunning ? "running" : "provisioning";
	const lifecycleState = isRunning ? "live" : "birth";
	const agentValues = {
		name: args.launchInput.name,
		bio: args.launchInput.description ?? null,
		avatarUrl: args.launchInput.imageUrl ?? null,
		cloudAgentId: args.cloud.cloudAgentId,
		runtimeProvider: "eliza-cloud",
		agentStatus,
		lifecycleState,
		webUiUrl: hostedUrl,
		bridgeUrl: args.cloud.containerUrl ?? args.cloud.containerId ?? null,
		billingMode: "owner_credits",
		infraReserveUsd: "5",
		suspendedReason: null,
		updatedAt: now,
	};

	if (row.agent) {
		await db.update(agents).set(agentValues).where(eq(agents.id, row.agent.id));
		await db
			.update(tokens)
			.set({ agentId: row.agent.id, agentStatus, ownerClaimStatus: "claimed", updatedAt: now })
			.where(eq(tokens.id, row.token.id));
		return;
	}

	const [created] = await db
		.insert(agents)
		.values({
			tokenId: row.token.id,
			...agentValues,
		})
		.returning({ id: agents.id });

	await db
		.update(tokens)
		.set({
			agentId: created?.id ?? row.token.agentId ?? null,
			agentStatus,
			ownerClaimStatus: "claimed",
			updatedAt: now,
		})
		.where(eq(tokens.id, row.token.id));
}

function isHostedRuntimeRunning(status: string | null | undefined): boolean {
	return ["running", "ready", "online", "active", "started"].includes(String(status ?? "").toLowerCase());
}

async function provisionHostedRuntimeAfterLaunch(
	db: Database,
	body: import("../../services/provision/payload-adapter.js").ProvisionRequest,
	launchInput: AgentLaunchInput,
	result: {
		agentId: string;
		tokenAddress: string;
		walletAddress?: string | null;
		treasuryAddress?: string | null;
	},
): Promise<ElizaCloudProvisionResult | null> {
	if (runtimeKindFromProvisionBody(body) !== "eliza-cloud") return null;
	const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, result.agentId).catch(() => null);
	const existingProvisioning = recordFromUnknown(recordFromUnknown(existing?.metadata)?.provisioning);
	const existingCloudAgentId = existingProvisioning?.cloudAgentId ?? existingProvisioning?.runtimeAgentId;
	if (typeof existingCloudAgentId === "string" && existingCloudAgentId.length > 0) {
		const account = recordFromUnknown(existingProvisioning.account);
		const cloud = {
			agentId: result.agentId,
			cloudAgentId: existingCloudAgentId,
			status: typeof existingProvisioning.status === "string" ? existingProvisioning.status : "pending",
			...(typeof existingProvisioning.characterId === "string"
				? { characterId: existingProvisioning.characterId }
				: {}),
			...(typeof existingProvisioning.jobId === "string" ? { jobId: existingProvisioning.jobId } : {}),
			...(typeof existingProvisioning.containerId === "string"
				? { containerId: existingProvisioning.containerId }
				: {}),
			...(typeof existingProvisioning.containerUrl === "string"
				? { containerUrl: existingProvisioning.containerUrl }
				: {}),
			...(typeof existingProvisioning.webUiUrl === "string" ? { webUiUrl: existingProvisioning.webUiUrl } : {}),
			...(Object.keys(account).length > 0 ? { account } : {}),
		};
		await syncTokenRuntimeOverlay(db, { tokenAddress: result.tokenAddress, launchInput, cloud });
		return cloud;
	}
	const client = getConfiguredElizaCloudClient();
	if (!client?.provisionWaifuAgent) {
		throw new Error("Eliza Cloud provisioning is not configured (set ELIZA_CLOUD_SERVICE_KEY)");
	}
	const cloud = await client.provisionWaifuAgent(
		buildCloudProvisionInput({
			agentId: result.agentId,
			tokenAddress: result.tokenAddress,
			walletAddress: result.walletAddress ?? null,
			treasuryAddress: result.treasuryAddress ?? null,
			launchInput,
			body,
		}),
	);
	await mergeCloudProvisioningMetadata(db, result.agentId, cloud);
	await syncTokenRuntimeOverlay(db, { tokenAddress: result.tokenAddress, launchInput, cloud });
	return cloud;
}

export type ResurrectAgentDeps = {
	db: ReturnType<typeof getDatabase>["db"];
	elizaClient: Pick<ElizaCloudClient, "resumeAgent" | "topUpCredits"> &
		Partial<Pick<ElizaCloudClient, "getAgentRuntimeStatus">>;
	emitEvent?: typeof emitAgentEvent;
};

/**
 * Resurrect a dormant agent after a patron credit top-up.
 * `creditsAmount` is accepted from waifu.fun clients in USD cents; Eliza Cloud
 * checkout receives dollar amounts.
 */
export async function resurrectAgent(
	agentId: string,
	creditsAmount: number,
	deps: ResurrectAgentDeps,
): Promise<{ agentId: string; creditsAmount: number; modelTier: "premium"; containerId?: string }> {
	const runtimeRefs = await resolveAgentRuntimeRefs(deps.db, agentId);
	const controlAgentId = runtimeRefs.containerId ?? agentId;
	await deps.elizaClient.topUpCredits(controlAgentId, creditsAmount / 100);
	if (runtimeRefs.containerId) {
		await deps.elizaClient.resumeAgent(runtimeRefs.containerId);
	}
	const runtimeStatus =
		runtimeRefs.containerId && deps.elizaClient.getAgentRuntimeStatus
			? await deps.elizaClient.getAgentRuntimeStatus(runtimeRefs.containerId).catch(() => null)
			: null;
	const overlay = resurrectedRuntimeOverlay(runtimeStatus);
	const now = new Date();
	await deps.db
		.update(agentPersonas)
		.set({
			dormantAt: null,
			brainPausedAt: null,
			brainPausedReason: null,
			lastWordsPostedAt: null,
			modelTier: "premium",
			creditsTopUpCount: sql`${agentPersonas.creditsTopUpCount} + 1`,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId));

	if (runtimeRefs.overlayAgentId) {
		await deps.db
			.update(agents)
			.set({
				agentStatus: overlay.agentStatus,
				lifecycleState: overlay.lifecycleState,
				...(overlay.webUiUrl !== undefined ? { webUiUrl: overlay.webUiUrl } : {}),
				...(overlay.containerId !== undefined ? { bridgeUrl: overlay.containerId } : {}),
				suspendedReason: null,
				updatedAt: now,
			})
			.where(eq(agents.id, runtimeRefs.overlayAgentId));
	}
	if (runtimeRefs.tokenId) {
		await deps.db
			.update(tokens)
			.set({ agentStatus: overlay.agentStatus, updatedAt: now })
			.where(eq(tokens.id, runtimeRefs.tokenId));
	}

	const emit = deps.emitEvent ?? emitAgentEvent;
	await emit({
		agentId,
		eventType: "agent.resurrected",
		data: {
			creditsAmount,
			modelTier: "premium",
			resurrectedAt: now.toISOString(),
			containerId: runtimeRefs.containerId ?? null,
		},
	});

	return {
		agentId,
		creditsAmount,
		modelTier: "premium",
		...(runtimeRefs.containerId ? { containerId: runtimeRefs.containerId } : {}),
	};
}

function resurrectedRuntimeOverlay(status: ElizaAgentRuntimeStatus | null): {
	agentStatus: string;
	lifecycleState: string;
	webUiUrl?: string | null;
	containerId?: string | null;
} {
	const webUiUrl = status?.webUiUrl ?? null;
	const running = isHostedRuntimeRunning(status?.status) && Boolean(webUiUrl);
	return {
		agentStatus: running ? "running" : "provisioning",
		lifecycleState: running ? "live" : "birth",
		...(webUiUrl ? { webUiUrl } : {}),
		...(status?.containerId ? { containerId: status.containerId } : {}),
	};
}

async function resolveAgentRuntimeRefs(
	db: Database,
	agentId: string,
): Promise<{ containerId: string | null; overlayAgentId: string | null; tokenId: string | null }> {
	const [persona] = await db
		.select({
			metadata: agentPersonas.metadata,
			tokenAddress: agentPersonas.tokenAddress,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	if (!persona) return { containerId: null, overlayAgentId: null, tokenId: null };

	const provisioning = recordFromUnknown(recordFromUnknown(persona.metadata).provisioning);
	const metadataContainerId =
		stringRecordField(provisioning, "cloudAgentId") ??
		stringRecordField(provisioning, "runtimeAgentId") ??
		stringRecordField(provisioning, "containerId");
	if (!persona.tokenAddress) return { containerId: metadataContainerId, overlayAgentId: null, tokenId: null };

	const [overlay] = await db
		.select({
			tokenId: tokens.id,
			overlayAgentId: agents.id,
			containerId: agents.bridgeUrl,
			cloudAgentId: agents.cloudAgentId,
		})
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${persona.tokenAddress})`)
		.limit(1);

	return {
		containerId: metadataContainerId ?? overlay?.containerId ?? overlay?.cloudAgentId ?? null,
		overlayAgentId: overlay?.overlayAgentId ?? null,
		tokenId: overlay?.tokenId ?? null,
	};
}

function stringRecordField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * POST /v2/agents/:id/resurrect
 *
 * Patron top-up endpoint. Body: { creditsAmount: number } where creditsAmount
 * is represented in USD cents in waifu.fun API responses.
 */
app.post("/:id/resurrect", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const agentId = c.get("patronAgent").agentId;
	let body: { creditsAmount?: unknown };
	try {
		body = (await c.req.json()) as { creditsAmount?: unknown };
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	if (typeof body.creditsAmount !== "number" || !Number.isFinite(body.creditsAmount) || body.creditsAmount <= 0) {
		return c.json({ error: "creditsAmount must be a positive number", unit: "usd_cents" }, 400);
	}

	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai";
	const apiKey = resolveElizaCloudApiKey() ?? "";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY ?? "";

	try {
		const result = await resurrectAgent(agentId, body.creditsAmount, {
			db,
			elizaClient: createElizaCloudClient({ baseUrl, apiKey, serviceKey, logger: console }),
		});
		return c.json({ ok: true, ...result, creditsUnit: "usd_cents" }, 200);
	} catch (err) {
		return c.json(
			{
				error: "failed to resurrect agent",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents
 *
 * List agents with pagination. Joins agent_personas ← agent_wallets ← curve_state ← tokens.
 *
 * Query params:
 *   - limit  (default 20, max 100)
 *   - offset (default 0)
 *   - status (optional, one of: active | graduated | failed | pending)
 */
async function maybeRequirePatron(c: Context<RequirePatronBindings>, next: Next) {
	const mine = c.req.query("mine") === "true";
	const hasBearer = Boolean(c.req.header("authorization") ?? c.req.header("Authorization"));
	if (mine || hasBearer) return requirePatron()(c, next);
	await next();
}

app.get("/", maybeRequirePatron, async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const limitRaw = c.req.query("limit");
	const offsetRaw = c.req.query("offset");
	const statusRaw = c.req.query("status");
	const sortRaw = c.req.query("sort");
	const includeLegacy = parseIncludeLegacy(c.req.query("includeLegacy"));
	const ownerRaw = c.req.query("owner");
	const mine = c.req.query("mine") === "true";
	const patron = c.get("patron");

	if (mine && !patron) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Steward bearer required" }, 401);
	}

	const ownerAddress = ownerRaw && ADDRESS_RE.test(ownerRaw) ? ownerRaw : undefined;
	if (ownerRaw && !ownerAddress && !patron) {
		return c.json({ error: "invalid owner address" }, 400);
	}

	let limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
	if (!Number.isFinite(limit) || limit <= 0) limit = 20;
	if (limit > 100) limit = 100;

	let offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
	if (!Number.isFinite(offset) || offset < 0) offset = 0;

	let status: agentQueries.AgentApiStatus | undefined;
	if (statusRaw) {
		if (!VALID_STATUS.has(statusRaw)) {
			return c.json(
				{
					error: "invalid status filter",
					allowed: [...VALID_STATUS],
				},
				400,
			);
		}
		status = statusRaw as agentQueries.AgentApiStatus;
	}

	// Unknown sort values fall back to "newest" (no 400) to stay backward-compatible.
	const sort: agentQueries.AgentListSort =
		sortRaw && VALID_SORT.has(sortRaw) ? (sortRaw as agentQueries.AgentListSort) : "newest";

	try {
		const result = await agentQueries.listAgents(db, {
			limit,
			offset,
			...(status ? { status } : {}),
			sort,
			includeLegacy,
			...(mine && patron ? { ownerStewardUserId: patron.stewardUserId } : {}),
			...(!mine && patron && ownerRaw ? { ownerStewardUserId: patron.stewardUserId } : {}),
			...(!mine && ownerAddress ? { ownerAddress } : {}),
		});

		// Surface treasury for agents whose Safe isn't captured by a NAV
		// snapshot yet (graduated LaunchFactory launches): read the Safe's BNB
		// balance and price it once for the page. Best-effort — an RPC/price
		// hiccup must never fail the list. waifufun#744.
		let bnbPriceUsd: number | null = null;
		try {
			const pending = result.agents.filter(
				(a) => (a.treasuryUsd === null || a.treasuryUsd === 0) && a.agentSafeAddress,
			);
			if (pending.length > 0) {
				const summary = await buildTreasurySummary(pending.map((a) => a.agentSafeAddress));
				bnbPriceUsd = summary.bnbPriceUsd;
				for (const agent of result.agents) {
					if (!agent.agentSafeAddress) continue;
					if (agent.treasuryUsd !== null && agent.treasuryUsd > 0) continue;
					const usd = summary.treasuryUsdByAddress.get(agent.agentSafeAddress.toLowerCase());
					if (usd !== undefined) agent.treasuryUsd = usd;
				}
			}
		} catch {
			// leave treasuryUsd as-is; frontend renders a dash for null
		}

		return c.json({ ...result, bnbPriceUsd });
	} catch (err) {
		return c.json(
			{
				error: "failed to list agents",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

type AgentControlState = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
};

async function readControlState(
	db: ReturnType<typeof getDatabase>["db"],
	agentId: string,
): Promise<AgentControlState | null> {
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	return row ?? null;
}

function serializeControlState(state: AgentControlState) {
	const ts = (value: Date | null) => (value ? value.toISOString() : null);
	return {
		agentId: state.agentId,
		brainPaused: state.brainPausedAt !== null,
		brainPausedAt: ts(state.brainPausedAt),
		brainPausedReason: state.brainPausedReason,
		withdrawalsPaused: state.withdrawalsPausedAt !== null,
		withdrawalsPausedAt: ts(state.withdrawalsPausedAt),
		withdrawalsPausedReason: state.withdrawalsPausedReason,
		killed: state.killedAt !== null,
		killedAt: ts(state.killedAt),
		killedReason: state.killedReason,
	};
}

async function parseControlReason(c: Context): Promise<string | null> {
	if (c.req.header("content-length") === "0") return null;
	try {
		const body = await c.req.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) return null;
		const reason = (body as { reason?: unknown }).reason;
		return typeof reason === "string" && reason.trim() ? reason.trim() : null;
	} catch {
		return null;
	}
}

app.post("/:id/pause", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const agentId = c.get("patronAgent").agentId;
	const agent = await readControlState(db, agentId);
	if (!agent) {
		return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, 404);
	}
	if (agent.killedAt) {
		return c.json({ ok: false, error: "AGENT_KILLED", message: `agent ${agentId} is permanently killed` }, 409);
	}

	const reason = await parseControlReason(c);
	const now = new Date();
	const [state] = await db
		.update(agentPersonas)
		.set({
			brainPausedAt: now,
			brainPausedReason: reason,
			withdrawalsPausedAt: now,
			withdrawalsPausedReason: reason,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		});

	await emitAgentEvent({ agentId, eventType: "agent.paused", data: { scope: "full", reason } });
	return c.json({ ok: true, data: serializeControlState(state ?? agent) });
});

app.post("/:id/kill", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const agentId = c.get("patronAgent").agentId;
	const existing = await readControlState(db, agentId);
	if (!existing) {
		return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, 404);
	}
	if (existing.killedAt) {
		return c.json({ ok: false, error: "AGENT_ALREADY_KILLED", message: `agent ${agentId} is already killed` }, 409);
	}

	const reason = await parseControlReason(c);
	const now = new Date();
	const [state] = await db
		.update(agentPersonas)
		.set({
			brainPausedAt: now,
			brainPausedReason: reason,
			withdrawalsPausedAt: now,
			withdrawalsPausedReason: reason,
			killedAt: now,
			killedReason: reason,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		});

	await emitAgentEvent({ agentId, eventType: "agent.killed", data: { reason } });
	return c.json({ ok: true, data: serializeControlState(state ?? existing) });
});

/**
 * GET /v2/agents/:tokenAddress/apps
 *
 * Registry of revenue-generating mini-apps associated with an agent token.
 */
app.get("/:token/apps", async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}

	try {
		const rows = await db
			.select()
			.from(agentApps)
			.where(eq(agentApps.agentTokenAddress, token.toLowerCase()))
			.orderBy(desc(agentApps.revenue7dUsd));

		const mapped = rows.map((row) => {
			const revenue24hUsd = numericToNumber(row.revenue24hUsd);
			const revenue7dUsd = numericToNumber(row.revenue7dUsd);
			const revenueLifetimeUsd = numericToNumber(row.revenueLifetimeUsd);
			return {
				id: row.id.toString(),
				agentTokenAddress: row.agentTokenAddress,
				appId: row.appId,
				name: row.name,
				description: row.description,
				icon: row.icon,
				appUrl: row.appUrl,
				status: row.status,
				shippedAt: row.shippedAt?.toISOString() ?? null,
				revenueLifetimeUsd,
				revenue24hUsd,
				revenue7dUsd,
				revenue7dDeltaPct: metadataNumber(row.metadata, "revenue7dDeltaPct"),
				settlementMode: getSettlementMode(row.metadata),
				metadata: row.metadata,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});

		// Sort: featured first (metadata.featured === true), then by
		// metadata.sort ascending, then by revenue7d descending. Platform
		// products (waifu.fun, Steward) land at the top via featured+sort;
		// revenue-bearing mini-apps fall in below by 7d revenue.
		const apps = mapped.slice().sort((a, b) => {
			const af = metadataBoolean(a.metadata, "featured") ? 1 : 0;
			const bf = metadataBoolean(b.metadata, "featured") ? 1 : 0;
			if (af !== bf) return bf - af;
			const asort = metadataNumber(a.metadata, "sort") ?? Number.POSITIVE_INFINITY;
			const bsort = metadataNumber(b.metadata, "sort") ?? Number.POSITIVE_INFINITY;
			if (asort !== bsort) return asort - bsort;
			return (b.revenue7dUsd ?? 0) - (a.revenue7dUsd ?? 0);
		});

		c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
		return c.json({
			ok: true,
			data: {
				apps,
				totalRevenue7d: apps.reduce((sum, app) => sum + app.revenue7dUsd, 0),
				totalLifetime: apps.reduce((sum, app) => sum + app.revenueLifetimeUsd, 0),
			},
		});
	} catch (err) {
		return c.json(
			{
				error: "failed to load agent apps",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/:tokenAddress
 *
 * Detail view for a single agent, keyed by on-chain token address.
 */
app.get("/:token", async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}

	try {
		const detail = await agentQueries.getAgentByTokenAddress(db, token.toLowerCase());
		if (!detail) {
			return c.json({ error: "agent not found" }, 404);
		}
		return c.json(detail);
	} catch (err) {
		return c.json(
			{
				error: "failed to load agent",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/:tokenAddress/trades
 *
 * Last 50 trades for this agent's token (newest first).
 */
app.get("/:token/trades", async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}

	try {
		const trades = await agentQueries.listAgentTrades(db, token.toLowerCase(), 50);
		return c.json({ trades });
	} catch (err) {
		return c.json(
			{
				error: "failed to list trades",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/:tokenAddress/fees
 *
 * Returns fee distribution events for this token. Four.Meme TaxToken fees are
 * accrued to the recipient address on-chain; if our indexer has populated
 * `fee_distributions` we return them, otherwise we return an empty array plus
 * a note that this data is currently query-from-chain only.
 */
app.get("/:token/fees", (c) => {
	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}
	return c.json({
		fees: [],
		note: "four.meme TaxToken fees are query-from-chain for now; on-chain fee events not yet indexed",
	});
});

app.get("/curve/:token", (c) => c.json({ error: "v2 curve query — indexer integration pending" }, 501));

type ProvisionValidationResult =
	| {
			ok: true;
			body: import("../../services/provision/payload-adapter.js").ProvisionRequest;
			launchInput: AgentLaunchInput;
			pullApiKey: string | null;
	  }
	| { ok: false; message: string; code?: string };

function readEnvAddress(name: string): `0x${string}` | null {
	const value = process.env[name];
	return value && isAddress(value) ? (value as `0x${string}`) : null;
}

function getProvisionAdapterConfig(): ProvisionAdapterConfig {
	const fourMemePlatformBps = Number(
		process.env.WAIFU_FOURMEME_PLATFORM_BPS ?? process.env.WAIFU_PLATFORM_CUT_BPS ?? 2500,
	);
	const flapVaultPortalAddress = readEnvAddress("FLAP_VAULT_PORTAL_ADDRESS");
	const flapSplitVaultFactoryAddress = readEnvAddress("FLAP_SPLIT_VAULT_FACTORY_ADDRESS");
	return {
		platformWallet: readEnvAddress("WAIFU_PLATFORM_FEE_WALLET"),
		fourMemePlatformBps: Number.isFinite(fourMemePlatformBps) ? fourMemePlatformBps : 2500,
		...(flapVaultPortalAddress ? { flapVaultPortalAddress } : {}),
		...(flapSplitVaultFactoryAddress ? { flapSplitVaultFactoryAddress } : {}),
	};
}

function validateProvisionBody(body: unknown, patron: PatronContext): ProvisionValidationResult {
	const validated = validateProvisionRequest(
		body,
		patron,
		getProvisionAdapterConfig(),
		slugifyAgentId,
		DEFAULT_PROVISION_IMAGE_URL,
	);
	if (!validated.ok) return validated;
	return {
		ok: true,
		body: validated.body,
		launchInput: validated.launchInput,
		pullApiKey: validated.pullRuntime ? generateRuntimeApiKey() : null,
	};
}

export async function redeemProvisionInviteCode(
	db: Database,
	code: string,
	patron: { stewardUserId: string; primaryAddress?: string | null },
): Promise<{ redeemed: boolean; alreadyRedeemed: boolean }> {
	return db.transaction(async (tx) => {
		let [creator] = await tx
			.select({ id: creators.id })
			.from(creators)
			.where(eq(creators.stewardUserId, patron.stewardUserId))
			.limit(1);

		if (!creator) {
			const [created] = await tx
				.insert(creators)
				.values({ stewardUserId: patron.stewardUserId })
				.onConflictDoUpdate({
					target: creators.stewardUserId,
					set: { updatedAt: new Date() },
				})
				.returning({ id: creators.id });
			if (!created) throw new Error("failed to resolve invite creator");
			creator = created;
		}

		const [invite] = await tx.execute<{
			id: string;
			maxUses: number;
			usedCount: number;
			isActive: boolean;
			expiresAt: Date | null;
		}>(sql`
			SELECT
				id,
				max_uses AS "maxUses",
				used_count AS "usedCount",
				is_active AS "isActive",
				expires_at AS "expiresAt"
			FROM invite_codes
			WHERE code = ${code}
			FOR UPDATE
		`);

		if (!invite || !invite.isActive || (invite.expiresAt && invite.expiresAt < new Date())) {
			throw new Error("invalid invite code");
		}

		const [existingRedemption] = await tx
			.select({ creatorId: inviteRedemptions.creatorId })
			.from(inviteRedemptions)
			.where(and(eq(inviteRedemptions.inviteCodeId, invite.id), eq(inviteRedemptions.creatorId, creator.id)))
			.limit(1);

		if (existingRedemption) return { redeemed: false, alreadyRedeemed: true };
		if (invite.usedCount >= invite.maxUses) throw new Error("invite code has reached max uses");

		const [redemption] = await tx
			.insert(inviteRedemptions)
			.values({ inviteCodeId: invite.id, creatorId: creator.id })
			.onConflictDoNothing()
			.returning({ inviteCodeId: inviteRedemptions.inviteCodeId });

		if (!redemption) return { redeemed: false, alreadyRedeemed: true };

		await tx
			.update(inviteCodes)
			.set({ usedCount: sql`${inviteCodes.usedCount} + 1`, updatedAt: new Date() })
			.where(eq(inviteCodes.id, invite.id));

		return { redeemed: true, alreadyRedeemed: false };
	});
}

export async function reserveProvisionInviteCode(
	db: Database,
	code: string,
	patron: { stewardUserId: string; primaryAddress?: string | null },
): Promise<{ reserved: boolean; alreadyRedeemed: boolean }> {
	return db.transaction(async (tx) => {
		let [creator] = await tx
			.select({ id: creators.id })
			.from(creators)
			.where(eq(creators.stewardUserId, patron.stewardUserId))
			.limit(1);

		if (!creator) {
			const [created] = await tx
				.insert(creators)
				.values({ stewardUserId: patron.stewardUserId })
				.onConflictDoUpdate({
					target: creators.stewardUserId,
					set: { updatedAt: new Date() },
				})
				.returning({ id: creators.id });
			if (!created) throw new Error("failed to resolve invite creator");
			creator = created;
		}

		const [invite] = await tx.execute<{
			id: string;
			maxUses: number;
			usedCount: number;
			isActive: boolean;
			expiresAt: Date | null;
		}>(sql`
			SELECT
				id,
				max_uses AS "maxUses",
				used_count AS "usedCount",
				is_active AS "isActive",
				expires_at AS "expiresAt"
			FROM invite_codes
			WHERE code = ${code}
			FOR UPDATE
		`);

		if (!invite || !invite.isActive || (invite.expiresAt && invite.expiresAt < new Date())) {
			throw new Error("invalid invite code");
		}

		const [existingRedemption] = await tx
			.select({ creatorId: inviteRedemptions.creatorId })
			.from(inviteRedemptions)
			.where(and(eq(inviteRedemptions.inviteCodeId, invite.id), eq(inviteRedemptions.creatorId, creator.id)))
			.limit(1);

		if (existingRedemption) return { reserved: false, alreadyRedeemed: true };

		const [pending] = await tx.execute<{ pendingCount: number }>(sql`
			SELECT COUNT(*)::int AS "pendingCount"
			FROM invite_redemptions
			WHERE invite_code_id = ${invite.id}
		`);
		const reservedOrRedeemedCount = Math.max(invite.usedCount, pending?.pendingCount ?? 0);
		if (reservedOrRedeemedCount >= invite.maxUses) throw new Error("invite code has reached max uses");

		const [redemption] = await tx
			.insert(inviteRedemptions)
			.values({ inviteCodeId: invite.id, creatorId: creator.id })
			.onConflictDoNothing()
			.returning({ inviteCodeId: inviteRedemptions.inviteCodeId });

		if (!redemption) return { reserved: false, alreadyRedeemed: true };
		return { reserved: true, alreadyRedeemed: false };
	});
}

export async function confirmProvisionInviteCode(
	db: Database,
	code: string,
	patron: { stewardUserId: string; primaryAddress?: string | null },
): Promise<void> {
	await db.transaction(async (tx) => {
		const [creator] = await tx
			.select({ id: creators.id })
			.from(creators)
			.where(eq(creators.stewardUserId, patron.stewardUserId))
			.limit(1);
		if (!creator) throw new Error("failed to resolve invite creator");

		const [invite] = await tx.execute<{ id: string }>(sql`
			SELECT id
			FROM invite_codes
			WHERE code = ${code}
			FOR UPDATE
		`);
		if (!invite) throw new Error("invalid invite code");

		const [existingRedemption] = await tx
			.select({ creatorId: inviteRedemptions.creatorId })
			.from(inviteRedemptions)
			.where(and(eq(inviteRedemptions.inviteCodeId, invite.id), eq(inviteRedemptions.creatorId, creator.id)))
			.limit(1);
		if (!existingRedemption) throw new Error("invite reservation missing");

		await tx
			.update(inviteCodes)
			.set({ usedCount: sql`${inviteCodes.usedCount} + 1`, updatedAt: new Date() })
			.where(eq(inviteCodes.id, invite.id));
	});
}

export async function releaseProvisionInviteCode(
	db: Database,
	code: string,
	patron: { stewardUserId: string; primaryAddress?: string | null },
): Promise<void> {
	await db.transaction(async (tx) => {
		const [creator] = await tx
			.select({ id: creators.id })
			.from(creators)
			.where(eq(creators.stewardUserId, patron.stewardUserId))
			.limit(1);
		if (!creator) return;

		const [invite] = await tx.execute<{ id: string }>(sql`
			SELECT id
			FROM invite_codes
			WHERE code = ${code}
			FOR UPDATE
		`);
		if (!invite) return;

		await tx
			.delete(inviteRedemptions)
			.where(and(eq(inviteRedemptions.inviteCodeId, invite.id), eq(inviteRedemptions.creatorId, creator.id)));
	});
}

// read-only invite validity check for non-duplicate provision attempts.
// duplicate recovery skips this because the invite was already validated
// and redeemed by the same patron in the recent original request.
async function peekInviteValidity(db: Database, code: string): Promise<{ valid: boolean; reason?: string }> {
	const [invite] = await db
		.select({
			maxUses: inviteCodes.maxUses,
			usedCount: inviteCodes.usedCount,
			isActive: inviteCodes.isActive,
			expiresAt: inviteCodes.expiresAt,
		})
		.from(inviteCodes)
		.where(eq(inviteCodes.code, code))
		.limit(1);

	if (!invite || !invite.isActive) return { valid: false, reason: "invalid invite code" };
	if (invite.expiresAt && invite.expiresAt < new Date()) return { valid: false, reason: "invite code has expired" };
	if (invite.usedCount >= invite.maxUses) return { valid: false, reason: "invite code has reached its usage limit" };
	return { valid: true };
}

async function findRecentProvisionDuplicate(
	db: Database,
	patronStewardUserId: string,
	name: string,
): Promise<{ agentId: string; taxRecipientAddress: string | null; tokenAddress: string | null } | null> {
	// Only treat a prior persona as a 'duplicate to recover' when its launch
	// actually completed (tokenAddress is set). Otherwise the orig launch died
	// mid-flight (4meme failure, chain receipt timeout, etc) and there is no
	// real agent to redirect the patron to. Returning 200 with an unfinished
	// row would tell them 'success' but the agent page would 404. Better to
	// fall through to the full launch path on retry so the orchestrator
	// re-attempts.
	const since = new Date(Date.now() - 5 * 60 * 1000);
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			taxRecipientAddress: agentPersonas.taxRecipientAddress,
			tokenAddress: agentPersonas.tokenAddress,
		})
		.from(agentPersonas)
		.where(
			and(
				eq(agentPersonas.ownerStewardUserId, patronStewardUserId),
				eq(agentPersonas.name, name),
				gt(agentPersonas.createdAt, since),
				isNotNull(agentPersonas.tokenAddress),
			),
		)
		.orderBy(desc(agentPersonas.createdAt))
		.limit(1);
	return row ?? null;
}

app.post("/provision", requirePatron(), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	const patron = c.get("patron");
	const validated = validateProvisionBody(rawBody, patron);
	if (!validated.ok) {
		return c.json(
			{ error: validated.message, reason: "validation", ...(validated.code ? { code: validated.code } : {}) },
			400,
		);
	}

	const duplicate = await findRecentProvisionDuplicate(db, patron.stewardUserId, validated.launchInput.name);
	if (duplicate) {
		// duplicate recovery uses the original redemption from the last five minutes.
		// do not reject single-use retry recovery just because the invite is now spent.
		let cloud: ElizaCloudProvisionResult | null = null;
		try {
			cloud =
				duplicate.tokenAddress && runtimeKindFromProvisionBody(validated.body) === "eliza-cloud"
					? await provisionHostedRuntimeAfterLaunch(db, validated.body, validated.launchInput, {
							agentId: duplicate.agentId,
							tokenAddress: duplicate.tokenAddress,
							treasuryAddress: duplicate.taxRecipientAddress,
						})
					: null;
		} catch (err) {
			return c.json(
				{
					error: "eliza cloud provisioning failed",
					detail: err instanceof Error ? err.message : String(err),
					agentId: duplicate.agentId,
					tokenAddress: duplicate.tokenAddress ?? null,
					safeAddress: duplicate.taxRecipientAddress ?? null,
				},
				502,
			);
		}
		const key = await (agentsRouteDepsForTest.createAgentKey ?? createKey)(db, duplicate.agentId);
		if (validated.pullApiKey) {
			await db
				.update(agentPersonas)
				.set({ runtimeApiKeyHash: hashRuntimeApiKey(validated.pullApiKey), updatedAt: new Date() })
				.where(eq(agentPersonas.agentId, duplicate.agentId));
		}
		return c.json(
			{
				agentId: duplicate.agentId,
				tokenAddress: duplicate.tokenAddress ?? null,
				safeAddress: duplicate.taxRecipientAddress ?? null,
				pullApiKey: validated.pullApiKey,
				agentApiKey: key.raw,
				...(cloud ? cloudResponseFields(cloud) : {}),
			},
			200,
		);
	}

	const inviteCheck = await peekInviteValidity(db, validated.body.inviteCode as string);
	if (!inviteCheck.valid) {
		return c.json({ error: inviteCheck.reason ?? "invalid invite code", reason: "validation" }, 400);
	}

	try {
		const reservation = await reserveProvisionInviteCode(db, validated.body.inviteCode as string, patron);
		if (reservation.alreadyRedeemed) {
			return c.json({ error: "invite unavailable", reason: "validation" }, 400);
		}
	} catch (err) {
		return c.json(
			{
				error: err instanceof Error ? err.message : "invalid invite code",
				reason: "validation",
			},
			400,
		);
	}

	let inviteConfirmed = false;
	let orchestrator: LaunchOrchestrator;
	try {
		orchestrator = getOrCreateLaunchOrchestrator();
	} catch (err) {
		await releaseProvisionInviteCode(db, validated.body.inviteCode as string, patron);
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		const result = await orchestrator.launch(validated.launchInput);
		await confirmProvisionInviteCode(db, validated.body.inviteCode as string, patron);
		inviteConfirmed = true;
		let cloud: ElizaCloudProvisionResult | null = null;
		try {
			cloud = await provisionHostedRuntimeAfterLaunch(db, validated.body, validated.launchInput, result);
		} catch (err) {
			return c.json(
				{
					error: "eliza cloud provisioning failed",
					detail: err instanceof Error ? err.message : String(err),
					agentId: result.agentId,
					tokenAddress: result.tokenAddress,
					safeAddress: result.treasuryAddress,
				},
				502,
			);
		}
		const key = await (agentsRouteDepsForTest.createAgentKey ?? createKey)(db, result.agentId);
		if (validated.pullApiKey) {
			await db
				.update(agentPersonas)
				.set({ runtimeApiKeyHash: hashRuntimeApiKey(validated.pullApiKey), updatedAt: new Date() })
				.where(eq(agentPersonas.agentId, result.agentId));
		}
		return c.json(
			{
				agentId: result.agentId,
				tokenAddress: result.tokenAddress,
				safeAddress: result.treasuryAddress,
				pullApiKey: validated.pullApiKey,
				agentApiKey: key.raw,
				...(cloud ? cloudResponseFields(cloud) : {}),
			},
			200,
		);
	} catch (err) {
		if (!inviteConfirmed) await releaseProvisionInviteCode(db, validated.body.inviteCode as string, patron);
		if (err instanceof FourMemeError) {
			return c.json({ error: "four.meme error", status: err.status, detail: err.message, body: err.body ?? null }, 502);
		}
		if (err instanceof AgentLaunchError) {
			return c.json({ error: "agent launch error", step: err.step, detail: err.message }, 500);
		}
		return c.json(
			{
				error: "internal error",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * POST /v2/agents/launch
 *
 * End-to-end agent launch:
 *   1. Steward provisions an agent wallet (or reuses an existing one)
 *   2. Wallet does SIWE login to Four.Meme API
 *   3. Image is uploaded to Four.Meme
 *   4. Four.Meme API returns (createArg, signature)
 *   5. TokenManager2.createToken is called on-chain via the agent wallet
 *   6. Agent metadata + token address are recorded in the DB
 *
 * Auth: expects a valid caller JWT (Steward or platform admin) — middleware TBD.
 *
 * Body shape matches `AgentLaunchInput` from services/agent-launch/types.ts.
 */
app.post("/launch", requireAgentAuth(), async (c) => {
	let body: AgentLaunchInput;
	try {
		body = (await c.req.json()) as AgentLaunchInput;
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	// Basic shape validation — deeper validation lives in the orchestrator.
	if (!body || typeof body !== "object") {
		return c.json({ error: "body must be an object" }, 400);
	}
	if (!body.name || !body.symbol || !body.description) {
		return c.json({ error: "name, symbol, and description are required" }, 400);
	}
	if (!body.imageUrl && !body.imageBase64) {
		return c.json({ error: "either imageUrl or imageBase64 is required" }, 400);
	}

	// If the body carries an explicit agentId, it must match the authed agent.
	const mismatchResp = ensureAgentIdMatches(
		c as unknown as Parameters<typeof ensureAgentIdMatches>[0],
		(body as { agentId?: string }).agentId,
	);
	if (mismatchResp) return mismatchResp;

	// Enforce one-launch-per-agent-lifetime for keys tied to an existing persona
	// that already has a token address.
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const authed = (c as unknown as { get(key: "authedAgent"): { agentId: string } }).get("authedAgent");
	if (!body.agentId) {
		body.agentId = authed.agentId;
	}
	const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, authed.agentId).catch(() => null);
	if (existing?.tokenAddress) {
		return c.json(
			{
				ok: false,
				error: "AGENT_ALREADY_LAUNCHED",
				message: `Agent ${authed.agentId} already launched token ${existing.tokenAddress}`,
			},
			409,
		);
	}

	let orchestrator: LaunchOrchestrator;
	try {
		orchestrator = getOrCreateLaunchOrchestrator();
	} catch (err) {
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		const result = await orchestrator.launch(body);
		return c.json(
			{
				agentId: result.agentId,
				walletAddress: result.walletAddress,
				tokenAddress: result.tokenAddress,
				treasuryAddress: result.treasuryAddress,
				txHash: result.txHash,
				fourMeme: result.fourMeme,
				identityRegistrationStatus: result.identityRegistrationStatus,
				...(result.agentIdentity ? { agentIdentity: result.agentIdentity } : {}),
			},
			200,
		);
	} catch (err) {
		if (err instanceof FourMemeError) {
			return c.json(
				{
					error: "four.meme error",
					status: err.status,
					detail: err.message,
					body: err.body ?? null,
				},
				502,
			);
		}
		if (err instanceof AgentLaunchError) {
			return c.json({ error: "agent launch error", step: err.step, detail: err.message }, 500);
		}
		return c.json(
			{
				error: "internal error",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

// Legacy/placeholder — keep for compat with any existing callers.
app.post("/create", (c) => c.json({ error: "use POST /v2/agents/launch instead", redirect: "/v2/agents/launch" }, 410));

export default app;
