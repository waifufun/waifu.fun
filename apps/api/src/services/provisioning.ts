import { desc, eq } from "drizzle-orm";
import type { Address } from "viem";

import {
	MiladyCloudRuntimeAdapter,
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
	creators,
	getDatabase,
	launches,
} from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { generateRuntimeApiKey, hashRuntimeApiKey } from "../middleware/agent-pull-auth.js";
import { emitAgentEvent } from "./events/emit.js";
import type { CreateAgentInput, MiladyClient } from "./milady-client.js";
import { getRuntimeRegistry } from "./runtime-registry.js";

export interface Logger {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
	error?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ProvisionClaimedAgentDeps {
	db?: Database;
	miladyClient?: MiladyClient;
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

	await emit({
		agentId,
		eventType: "agent.provisioning_started",
		data: { source: "webhook-consumer", runtimeKind },
	});

	if (persona.runtimeKind === "third-party-pull") {
		return provisionThirdPartyPullAgent(db, agentId, persona, emit);
	}

	const safe = await getAgentSafeAddress(db, persona.id);
	const registry = deps.runtimeRegistry ?? legacyRegistryFromDeps(deps) ?? getRuntimeRegistry();
	const adapter = registry.get(runtimeKind);
	if (!adapter) throw new Error(`runtime adapter not registered for ${runtimeKind}`);
	const provisionOptions = buildProvisionOptions(agentId, persona, eventData, safe);

	try {
		const result = await adapter.provision(provisionOptions);
		await storeProvisioningSuccess(db, agentId, runtimeKind, provisionOptions, result);
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
		runtimeWebhookUrl?: string | null;
	},
	eventData: Record<string, unknown>,
	safeAddress: string | null,
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
		xHandle:
			stringField(eventData, "xHandle") ??
			stringField(eventData, "claimedByXHandle") ??
			persona.claimedByXHandle ??
			persona.twitterHandle ??
			null,
	};

	const webhookUrl = stringField(eventData, "webhookUrl") ?? persona.runtimeWebhookUrl;
	if (webhookUrl) opts.webhookUrl = webhookUrl;
	const webhookSecret = stringField(eventData, "webhookSecret");
	if (webhookSecret) opts.webhookSecret = webhookSecret;
	const apiKey = stringField(eventData, "apiKey");
	if (apiKey) opts.apiKey = apiKey;

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
	const containerUrl = stringField(provisioning ?? {}, "containerUrl");
	const lastError = stringField(provisioning ?? {}, "lastError") ?? latestError(events);

	let state: "pending" | "provisioning" | "live" | "failed" | "dormant" = "pending";
	if (killedOrPaused) state = "dormant";
	else if (failed || deadLetter || lastError) state = "failed";
	else if (containerId) state = "live";
	else if (latestProvisioningEvent?.eventType === "agent.claimed") state = "provisioning";
	else if (persona.agentLaunchStatus === "claimed") state = "provisioning";

	return {
		state,
		...(containerId ? { containerId } : {}),
		...(containerUrl ? { containerUrl } : {}),
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
			livenessCheckUrl: result.livenessCheckUrl ?? null,
			status: "provisioned",
			lastError: null,
			updatedAt: new Date().toISOString(),
		},
		{
			runtimeKind,
			runtimeWebhookUrl: runtimeKind === "third-party-webhook" ? (options.webhookUrl ?? null) : null,
			runtimeWebhookSecretHash: result.runtimeWebhookSecretHash ?? null,
			runtimeApiKeyHash: result.runtimeApiKeyHash ?? null,
			runtimeLastSeenAt: new Date(),
		},
	);
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
	if (!deps.miladyClient) return null;
	const adapter = new MiladyCloudRuntimeAdapter({ client: deps.miladyClient });
	return new Map([[adapter.kind, adapter]]);
}

function runtimeKindFrom(data: Record<string, unknown>, fallback: string | null): RuntimeKind {
	const value = stringField(data, "runtimeKind") ?? fallback ?? "milady-cloud";
	if (value === "milady-cloud" || value === "third-party-webhook" || value === "third-party-pull") {
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

function addressValue(value: string | null): Address | null {
	if (!value) return null;
	return /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
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
