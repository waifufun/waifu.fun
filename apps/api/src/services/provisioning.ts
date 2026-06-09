import { desc, eq, sql } from "drizzle-orm";
import { type Address, isAddress } from "viem";

import {
	ElizaCloudRuntimeAdapter,
	type ProvisionOptions,
	type ProvisionResult,
	type RuntimeAdapter,
	type RuntimeKind,
} from "@waifufun/agent-runtime";
import {
	agentEvents,
	agentPersonaQueries,
	type agentPersonas,
	agentSafes,
	agentWallets,
	agents,
	creators,
	getDatabase,
	launches,
	tokens,
} from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { generateRuntimeApiKey, hashRuntimeApiKey } from "../middleware/agent-pull-auth.js";
import type { CreateAgentInput, ElizaClient } from "./eliza-client.js";
import { emitAgentEvent } from "./events/emit.js";
import { getRuntimeRegistry } from "./runtime-registry.js";

export interface Logger {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
	error?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ProvisionClaimedAgentDeps {
	db?: Database;
	elizaClient?: ElizaClient;
	runtimeRegistry?: Map<RuntimeKind, RuntimeAdapter>;
	logger?: Logger;
	emitEvent?: typeof emitAgentEvent;
}

export interface AgentSpec {
	personaId: string;
	xHandle: string | null;
	taxConfig: unknown;
	safeAddress: Address | null;
}

const PROVISIONING_EVENT_TYPES = [
	"agent.claimed",
	"agent.provisioned",
	"agent.provisioning_failed",
	"agent.provisioning_dead_letter",
] as const;

export interface PullProvisionResult {
	runtimeAgentId: string;
	runtimeApiKey: string;
	eventEndpoint: string;
	heartbeatEndpoint: string;
}

export async function provisionClaimedAgent(
	agentId: string,
	eventData: Record<string, unknown> = {},
	deps: ProvisionClaimedAgentDeps = {},
): Promise<ProvisionResult | PullProvisionResult> {
	const db = deps.db ?? requireDb();
	const emit = deps.emitEvent ?? emitAgentEvent;

	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(db, agentId);
	if (!persona) {
		throw new Error(`agent persona not found for ${agentId}`);
	}

	const runtimeKind = runtimeKindFrom(eventData, persona.runtimeKind);
	const existing = existingProvisionResult(persona.metadata, runtimeKind);
	if (existing) return existing;

	await emit({
		agentId,
		eventType: "agent.provisioning_started",
		data: { source: "webhook-consumer", runtimeKind },
	});

	if (persona.runtimeKind === "third-party-pull") {
		return provisionThirdPartyPullAgent(db, agentId, persona, emit);
	}

	const safe = await getAgentSafeAddress(db, persona.id);
	const agentWalletAddress = await getStoredAgentWalletAddress(db, persona.agentId);
	const registry = deps.runtimeRegistry ?? legacyRegistryFromDeps(deps) ?? getRuntimeRegistry();
	const adapter = registry.get(runtimeKind);
	if (!adapter) throw new Error(`runtime adapter not registered for ${runtimeKind}`);
	const provisionOptions = buildProvisionOptions(agentId, persona, eventData, safe, agentWalletAddress);

	try {
		const result = await adapter.provision(provisionOptions);
		await storeProvisioningSuccess(db, agentId, runtimeKind, provisionOptions, result);
		await syncProvisioningTokenOverlay(db, provisionOptions, result);
		await ensureProvisionedLaunch(db, persona, safe);
		await emit({
			agentId,
			eventType: "agent.provisioned",
			data: {
				runtimeKind,
				runtimeAgentId: result.runtimeAgentId,
				containerId: result.containerId,
				livenessCheckUrl: result.livenessCheckUrl,
			},
		});
		return result;
	} catch (err) {
		await storeProvisioningFailure(db, agentId, err);
		throw err;
	}
}

export async function provisionThirdPartyPullAgent(
	db: Database,
	agentId: string,
	persona: { id: string; name: string },
	emit: typeof emitAgentEvent = emitAgentEvent,
): Promise<PullProvisionResult> {
	const runtimeApiKey = generateRuntimeApiKey();
	await agentPersonaQueries.updateAgentPersona(db, persona.id, {
		runtimeKind: "external-pull",
		runtimeApiKeyHash: hashRuntimeApiKey(runtimeApiKey),
		runtimeLastSeenAt: null,
	});

	const hbSignalUrl = `/v2/agents/${agentId}/heartbeat`;
	const eventsUrl = `/v2/agents/${agentId}/events/pull`;

	await emit({
		agentId,
		eventType: "agent.provisioned",
		data: {
			runtimeKind: "third-party-pull",
			heartbeatEndpoint: hbSignalUrl,
			eventEndpoint: eventsUrl,
			status: "provisioned",
		},
	});

	const result: PullProvisionResult = {
		runtimeAgentId: agentId,
		runtimeApiKey,
		heartbeatEndpoint: hbSignalUrl,
		eventEndpoint: eventsUrl,
	};
	return result;
}

export function buildCreateAgentInput(
	agentId: string,
	persona: {
		id?: string;
		name: string;
		claimedByXHandle: string | null;
		twitterHandle?: string | null;
		taxConfig: unknown;
	},
	eventData: Record<string, unknown>,
	safeAddress: string | null,
): CreateAgentInput {
	const spec: AgentSpec = {
		personaId: stringField(eventData, "personaId") ?? agentId,
		xHandle:
			stringField(eventData, "xHandle") ??
			stringField(eventData, "claimedByXHandle") ??
			persona.claimedByXHandle ??
			persona.twitterHandle ??
			null,
		taxConfig: eventData.taxConfig ?? persona.taxConfig ?? null,
		safeAddress: addressValue(stringField(eventData, "safeAddress") ?? safeAddress),
	};

	return {
		agentName: persona.name || agentId,
		agentConfig: spec as unknown as Record<string, unknown>,
	};
}

export function buildProvisionOptions(
	agentId: string,
	persona: {
		name: string;
		bio: string | null;
		avatarUrl: string | null;
		systemPrompt: string | null;
		claimedByXHandle: string | null;
		twitterHandle?: string | null;
		ownerAddress?: string | null;
		runtimeWebhookUrl?: string | null;
		tokenAddress?: string | null;
		chain?: string | null;
		prelaunchParams?: unknown;
	},
	eventData: Record<string, unknown>,
	safeAddress: string | null,
	storedAgentWalletAddress: string | null = null,
): ProvisionOptions {
	const opts: ProvisionOptions = {
		agentId,
		agentName: persona.name || agentId,
		persona: {
			name: persona.name || agentId,
			bio: persona.bio ?? "",
			...(persona.avatarUrl ? { image: persona.avatarUrl } : {}),
			...(persona.systemPrompt ? { promptTemplate: persona.systemPrompt } : {}),
		},
		safeAddress: stringField(eventData, "safeAddress") ?? safeAddress,
		tokenAddress:
			stringField(eventData, "tokenContractAddress") ??
			stringField(eventData, "tokenAddress") ??
			persona.tokenAddress ??
			null,
		chain: stringField(eventData, "chain") ?? persona.chain ?? "bsc",
		chainId: numberField(eventData, "chainId") ?? Number.parseInt(process.env.CHAIN_ID ?? "56", 10),
		tokenName:
			stringField(eventData, "tokenName") ??
			stringField(eventData, "name") ??
			tokenParam(persona.prelaunchParams, "name") ??
			persona.name,
		tokenTicker:
			stringField(eventData, "tokenTicker") ??
			stringField(eventData, "symbol") ??
			tokenParam(persona.prelaunchParams, "symbol") ??
			agentId.slice(0, 10).toUpperCase(),
		launchType: launchTypeField(eventData, "launchType") ?? "native",
		xHandle:
			stringField(eventData, "xHandle") ??
			stringField(eventData, "claimedByXHandle") ??
			persona.claimedByXHandle ??
			persona.twitterHandle ??
			null,
	};

	const primaryWalletAddress =
		stringField(eventData, "primaryWalletAddress") ??
		stringField(eventData, "agentWalletAddress") ??
		stringField(eventData, "walletAddress") ??
		storedAgentWalletAddress;
	if (primaryWalletAddress) {
		if (!isAddress(primaryWalletAddress)) {
			throw new Error(`agent EVM wallet must be a valid EVM address for Eliza Cloud provisioning (${agentId})`);
		}
		opts.account = {
			primaryWalletAddress,
			walletKeyRef:
				stringField(eventData, "walletKeyRef") ?? stringField(eventData, "agentWalletKeyRef") ?? `steward:${agentId}`,
		};
	}

	const adminWallets = stringArrayField(eventData, "adminWallets");
	const fallbackAdminWallet = persona.ownerAddress ?? safeAddress;
	const resolvedAdminWallets = (
		adminWallets.length > 0 ? adminWallets : fallbackAdminWallet ? [fallbackAdminWallet] : []
	)
		.map((wallet) => wallet.trim())
		.filter(Boolean);
	opts.access = {
		guestMinTokens: numberField(eventData, "guestMinTokens") ?? 1_000,
		userMinTokens: numberField(eventData, "userMinTokens") ?? 100_000,
		thresholdMode: "strict_gt",
		adminWallets: resolvedAdminWallets,
	};
	opts.billing = {
		mode: "owner_credits",
		initialReserveUsd: numberField(eventData, "initialReserveUsd") ?? 5,
	};
	const containerImageUri = stringField(eventData, "containerImageUri") ?? stringField(eventData, "imageUri");
	const containerProjectName = stringField(eventData, "containerProjectName");
	const containerPort = numberField(eventData, "containerPort");
	const containerEnvironmentVars =
		stringRecordField(eventData, "containerEnvironmentVars") ?? stringRecordField(eventData, "containerEnv");
	if (containerImageUri) {
		opts.container = {
			imageUri: containerImageUri,
			...(containerProjectName ? { projectName: containerProjectName } : {}),
			...(containerPort ? { port: containerPort } : {}),
			...(containerEnvironmentVars ? { environmentVars: containerEnvironmentVars } : {}),
		};
	}
	const invalidAdminWallet = resolvedAdminWallets.find((wallet) => !isAddress(wallet));
	if (invalidAdminWallet) {
		throw new Error(`admin wallet must be a valid EVM address for Eliza Cloud provisioning (${agentId})`);
	}

	const webhookUrl = stringField(eventData, "webhookUrl") ?? persona.runtimeWebhookUrl;
	if (webhookUrl) opts.webhookUrl = webhookUrl;
	const webhookSecret = stringField(eventData, "webhookSecret");
	if (webhookSecret) opts.webhookSecret = webhookSecret;
	const apiKey = stringField(eventData, "apiKey");
	if (apiKey) opts.apiKey = apiKey;
	const smallModel =
		stringField(eventData, "smallModel") ??
		process.env.WAIFU_ELIZA_DEFAULT_MODEL ??
		process.env.ELIZAOS_CLOUD_SMALL_MODEL ??
		process.env.ELIZAOS_CLOUD_DEFAULT_MODEL ??
		"anthropic/claude-haiku-4.5";
	opts.modelDefaults = { ELIZAOS_CLOUD_SMALL_MODEL: smallModel };

	return opts;
}

export async function getAgentRuntimeState(db: Database, agentId: string) {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(db, agentId);
	if (!persona) return null;

	const events = await db
		.select()
		.from(agentEvents)
		.where(eq(agentEvents.agentId, agentId))
		.orderBy(desc(agentEvents.createdAt))
		.limit(20);
	const latestProvisioningEvent = events.find((event) =>
		(PROVISIONING_EVENT_TYPES as readonly string[]).includes(event.eventType),
	);

	const metadata = recordFromUnknown(persona.metadata);
	const provisioning = recordFromUnknown(metadata?.provisioning);
	const failed = latestProvisioningEvent?.eventType === "agent.provisioning_failed";
	const deadLetter = latestProvisioningEvent?.eventType === "agent.provisioning_dead_letter";
	const killedOrPaused = persona.killedAt || persona.brainPausedAt;
	const containerId = stringField(provisioning ?? {}, "containerId");
	const cloudAgentId = stringField(provisioning ?? {}, "cloudAgentId");
	const runtimeAgentId = stringField(provisioning ?? {}, "runtimeAgentId") ?? cloudAgentId;
	const containerUrl = stringField(provisioning ?? {}, "containerUrl");
	const webUiUrl = stringField(provisioning ?? {}, "webUiUrl");
	const provisioningStatus = stringField(provisioning ?? {}, "status");
	const lastError = stringField(provisioning ?? {}, "lastError") ?? latestError(events);

	let state: "pending" | "provisioning" | "live" | "failed" | "dormant" = "pending";
	if (killedOrPaused) state = "dormant";
	else if (failed || deadLetter || lastError) state = "failed";
	else if (webUiUrl) state = "live";
	else if (runtimeAgentId) state = "provisioning";
	else if (latestProvisioningEvent?.eventType === "agent.claimed") state = "provisioning";
	else if (persona.agentLaunchStatus === "claimed") state = "provisioning";

	return {
		state,
		...(runtimeAgentId ? { runtimeAgentId } : {}),
		...(cloudAgentId ? { cloudAgentId } : {}),
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
		...(webUiUrl ? { webUiUrl } : {}),
		...(latestProvisioningEvent ? { lastEventAt: latestProvisioningEvent.createdAt.toISOString() } : {}),
		...(lastError ? { lastError } : {}),
	};
}

async function ensureProvisionedLaunch(
	db: Database,
	persona: {
		agentId: string;
		name: string;
		bio: string | null;
		avatarUrl: string | null;
		prelaunchParams: unknown;
		taxFeeRate: number | null;
		taxRecipientAddress: string | null;
		taxConfig: unknown;
	},
	safeAddress: string | null,
): Promise<void> {
	if (!safeAddress) return;

	const [existing] = await db
		.select({ id: launches.id })
		.from(launches)
		.where(eq(launches.agentId, persona.agentId))
		.limit(1);
	if (existing) return;

	const normalizedSafe = safeAddress.toLowerCase();
	const [creator] = await db
		.insert(creators)
		.values({ evmAddress: normalizedSafe })
		.onConflictDoUpdate({
			target: creators.evmAddress,
			set: { updatedAt: new Date() },
		})
		.returning({ id: creators.id });
	if (!creator) throw new Error(`failed to upsert launch creator for ${persona.agentId}`);

	const params = recordFromUnknown(persona.prelaunchParams) ?? {};
	const taxConfig = recordFromUnknown(persona.taxConfig);
	const taxRecipient = persona.taxRecipientAddress ?? stringField(taxConfig ?? {}, "recipientAddress") ?? null;

	await db.insert(launches).values({
		creatorId: creator.id,
		agentId: persona.agentId,
		tokenName: stringField(params, "name") ?? persona.name,
		tokenTicker: stringField(params, "symbol") ?? persona.agentId.slice(0, 10).toUpperCase(),
		tokenImageUrl: stringField(params, "imageUrl") ?? persona.avatarUrl,
		tokenDescription: stringField(params, "description") ?? persona.bio,
		socials: buildLaunchSocials(params),
		chainId: Number.parseInt(process.env.CHAIN_ID ?? "56", 10),
		portalAddress: process.env.FOURMEME_PORTAL_ADDRESS ?? "0x0000000000000000000000000000000000000000",
		quoteToken: "BNB",
		taxRate: persona.taxFeeRate ?? 0,
		creatorAddress: normalizedSafe,
		taxRecipientAddress: taxRecipient?.toLowerCase() ?? null,
		firstBuyWei: bnbToWeiString(stringField(params, "preSale")),
		taxSplit: {
			agentBps: 8000,
			patronBps: 2000,
			...(taxRecipient ? { splitterAddress: taxRecipient.toLowerCase() } : {}),
		},
		status: "provisioned",
	});
}

function buildLaunchSocials(params: Record<string, unknown>): Record<string, string> {
	const socials: Record<string, string> = {};
	const website = stringField(params, "webUrl");
	const twitter = stringField(params, "twitterUrl");
	const telegram = stringField(params, "telegramUrl");
	if (website) socials.website = website;
	if (twitter) socials.twitter = twitter;
	if (telegram) socials.telegram = telegram;
	return socials;
}

function bnbToWeiString(value: string | null): string {
	if (!value) return "0";
	try {
		const [wholeRaw, fracRaw = ""] = value.trim().split(".");
		const whole = wholeRaw && /^\d+$/.test(wholeRaw) ? wholeRaw : "0";
		const frac = (fracRaw.replace(/\D/g, "") + "0".repeat(18)).slice(0, 18);
		return (BigInt(whole) * 10n ** 18n + BigInt(frac || "0")).toString();
	} catch {
		return "0";
	}
}

async function getAgentSafeAddress(db: Database, personaId: string): Promise<string | null> {
	const [row] = await db
		.select({ safeAddress: agentSafes.safeAddress })
		.from(agentSafes)
		.where(eq(agentSafes.agentId, personaId))
		.limit(1);
	return row?.safeAddress ?? null;
}

async function getStoredAgentWalletAddress(db: Database, agentId: string): Promise<string | null> {
	const [row] = await db
		.select({ walletAddress: agentWallets.walletAddress })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, agentId))
		.limit(1);
	return row?.walletAddress ?? null;
}

async function storeProvisioningSuccess(
	db: Database,
	agentId: string,
	runtimeKind: RuntimeKind,
	options: ProvisionOptions,
	result: ProvisionResult,
): Promise<void> {
	await mergePersonaProvisioningMetadata(
		db,
		agentId,
		{
			runtimeKind,
			runtimeAgentId: result.runtimeAgentId,
			containerId: result.containerId ?? null,
			containerUrl: result.containerUrl ?? null,
			webUiUrl: result.webUiUrl ?? null,
			livenessCheckUrl: result.livenessCheckUrl ?? null,
			status: result.status ?? "provisioned",
			lastError: null,
			updatedAt: new Date().toISOString(),
		},
		{
			runtimeKind,
			...(runtimeKind === "eliza-cloud" ? { elizaCloudAgentId: result.runtimeAgentId } : {}),
			runtimeWebhookUrl: runtimeKind === "third-party-webhook" ? (options.webhookUrl ?? null) : null,
			runtimeWebhookSecretHash: result.runtimeWebhookSecretHash ?? null,
			runtimeApiKeyHash: result.runtimeApiKeyHash ?? null,
			runtimeLastSeenAt: new Date(),
		},
	);
}

async function syncProvisioningTokenOverlay(
	db: Database,
	options: ProvisionOptions,
	result: ProvisionResult,
): Promise<void> {
	if (!options.tokenAddress) return;
	const [row] = await db
		.select({ token: tokens, agent: agents })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${options.tokenAddress})`)
		.limit(1);
	if (!row) return;

	const now = new Date();
	const hostedUrl = result.webUiUrl ?? null;
	const isRunning = Boolean(hostedUrl) && isHostedRuntimeRunning(result.status);
	const agentStatus = isRunning ? "running" : "provisioning";
	const lifecycleState = isRunning ? "live" : "birth";
	const agentValues = {
		name: options.tokenName ?? options.agentName,
		bio: options.persona.bio ?? null,
		avatarUrl: options.persona.image ?? null,
		cloudAgentId: result.runtimeAgentId,
		runtimeProvider: "eliza-cloud",
		agentStatus,
		lifecycleState,
		webUiUrl: hostedUrl,
		bridgeUrl: result.containerUrl ?? result.containerId ?? null,
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

async function storeProvisioningFailure(db: Database, agentId: string, err: unknown): Promise<void> {
	await mergePersonaProvisioningMetadata(db, agentId, {
		status: "failed",
		lastError: err instanceof Error ? err.message : String(err),
		failedAt: new Date().toISOString(),
	});
}

async function mergePersonaProvisioningMetadata(
	db: Database,
	agentId: string,
	provisioning: Record<string, unknown>,
	runtimeFields: Partial<typeof agentPersonas.$inferInsert> = {},
): Promise<void> {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(db, agentId);
	if (!persona) return;
	const metadata = recordFromUnknown(persona.metadata) ?? {};
	const existing = recordFromUnknown(metadata.provisioning) ?? {};
	await agentPersonaQueries.updateAgentPersona(db, persona.id, {
		...runtimeFields,
		metadata: {
			...metadata,
			provisioning: {
				...existing,
				...provisioning,
			},
		},
	});
}

function legacyRegistryFromDeps(deps: ProvisionClaimedAgentDeps): Map<RuntimeKind, RuntimeAdapter> | null {
	if (!deps.elizaClient) return null;
	const adapter = new ElizaCloudRuntimeAdapter({ client: deps.elizaClient });
	return new Map([[adapter.kind, adapter]]);
}

function runtimeKindFrom(data: Record<string, unknown>, fallback: string | null): RuntimeKind {
	const value = stringField(data, "runtimeKind") ?? fallback ?? "eliza-cloud";
	if (value === "eliza-cloud" || value === "third-party-webhook" || value === "third-party-pull") {
		return value;
	}
	throw new Error(`unsupported runtime kind: ${value}`);
}

function requireDb(): Database {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) throw new Error("DATABASE_URL is required for provisioning");
	return getDatabase(url).db;
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
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

function addressValue(value: string | null): Address | null {
	if (!value) return null;
	return /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function existingProvisionResult(metadata: unknown, runtimeKind: RuntimeKind): ProvisionResult | null {
	if (runtimeKind !== "eliza-cloud") return null;
	const root = recordFromUnknown(metadata);
	const provisioning = recordFromUnknown(root?.provisioning);
	if (!provisioning) return null;
	const runtimeAgentId = stringField(provisioning, "runtimeAgentId") ?? stringField(provisioning, "cloudAgentId");
	const containerId = stringField(provisioning, "containerId");
	if (!runtimeAgentId && !containerId) return null;
	const livenessCheckUrl = stringField(provisioning, "livenessCheckUrl");
	const containerUrl = stringField(provisioning, "containerUrl");
	const webUiUrl = stringField(provisioning, "webUiUrl");
	return {
		runtimeAgentId: runtimeAgentId ?? containerId ?? "",
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
		...(webUiUrl ? { webUiUrl } : {}),
		...(livenessCheckUrl ? { livenessCheckUrl } : {}),
	};
}

function latestError(events: { eventType: string; data: Record<string, unknown> }[]): string | null {
	for (const event of events) {
		if (event.eventType !== "agent.provisioning_failed" && event.eventType !== "agent.provisioning_dead_letter") {
			continue;
		}
		const error = stringField(event.data, "error");
		if (error) return error;
	}
	return null;
}
