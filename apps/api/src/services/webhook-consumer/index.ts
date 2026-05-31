import { agentPersonas, agents, getDatabase, tokens } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { eq, sql } from "drizzle-orm";

import {
	type ElizaAgentRuntimeStatus,
	type ElizaCloudClient,
	ElizaCloudNotConfiguredError,
	type Logger,
} from "../eliza-client.js";
import { emitAgentEvent } from "../events/emit.js";
import { provisionClaimedAgent } from "../provisioning.js";
import { type XClient, getAgentXClient } from "../x/agent-x-client.js";

export type WebhookConsumerEvent = {
	event: string;
	timestamp: string;
	agentId: string | null;
	data: Record<string, unknown>;
	idempotencyKey?: string;
};

type ModelTier = "premium" | "standard" | "free";

type PersonaState = {
	agentId: string;
	modelTier: ModelTier | null;
	lastWordsPostedAt?: Date | null;
};

export type WebhookConsumerPersonaStore = {
	get(agentId: string): Promise<PersonaState | null>;
	setModelTier(agentId: string, tier: ModelTier): Promise<void>;
	markLastWordsPosted(agentId: string, now: Date): Promise<void>;
	markDormant(agentId: string, now: Date): Promise<void>;
};

export type WebhookConsumerDeps = {
	elizaCloud: ElizaCloudClient;
	logger: Logger;
	db?: Database;
	emitEvent?: typeof emitAgentEvent;
	personaStore?: WebhookConsumerPersonaStore;
	getXClient?: (agentId: string) => Promise<XClient | null>;
};

export async function dispatchEvent(event: WebhookConsumerEvent, deps: WebhookConsumerDeps): Promise<void> {
	const logger = deps.logger;

	try {
		switch (event.event) {
			case "agent.claimed": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] agent.claimed missing agentId", { event });
					return;
				}
				logger.info?.("[webhook-consumer] agent.claimed recorded; waiting for agent.launched before cloud provision", {
					agentId: event.agentId,
				});
				return;
			}
			case "agent.launched": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] agent.launched missing agentId", { event });
					return;
				}
				await provisionClaimedAgent(event.agentId, event.data);
				return;
			}
			case "agent.credits.low": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] agent.credits.low missing agentId", { event });
					return;
				}
				await handleCreditsLow(event.agentId, deps);
				return;
			}
			case "agent.credits.depleted": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] agent.credits.depleted missing agentId", { event });
					return;
				}
				await handleCreditsDepleted(event.agentId, event.data, deps);
				return;
			}
			case "credits.topped_up":
			case "agent.credits.topped_up": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] credits.topped_up missing agentId", { event });
					return;
				}
				await handleCreditsToppedUp(event.agentId, event.data, deps);
				return;
			}
			case "agent.kill_activated":
			case "agent.killed": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] kill event missing agentId", { event });
					return;
				}
				await pauseAgentContainer(event.agentId, event.data, deps, event.event);
				return;
			}
			case "agent.revived":
			case "agent.resumed": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] revive event missing agentId", { event });
					return;
				}
				await resumeAgentContainer(event.agentId, event.data, deps, event.event);
				return;
			}
			default:
				logger.info?.("[webhook-consumer] ignored event", { eventType: event.event });
				return;
		}
	} catch (err) {
		if (err instanceof ElizaCloudNotConfiguredError) {
			logger.warn?.("[webhook-consumer] eliza cloud not configured; skipping", {
				eventType: event.event,
				agentId: event.agentId,
			});
			return;
		}

		if ((event.event === "agent.claimed" || event.event === "agent.launched") && event.agentId) {
			const emit = deps.emitEvent ?? emitAgentEvent;
			const retryCount = numberField(event.data, "retryCount") + 1;
			await emit({
				agentId: event.agentId,
				eventType: "agent.provisioning_failed",
				data: {
					sourceEvent: event.event,
					sourceIdempotencyKey: event.idempotencyKey ?? null,
					retryCount,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}

		throw err;
	}
}

async function handleCreditsLow(agentId: string, deps: WebhookConsumerDeps): Promise<void> {
	const store = deps.personaStore ?? createDefaultPersonaStore();
	const persona = await store.get(agentId);
	if (!persona) {
		deps.logger.warn?.("[webhook-consumer] credits.low persona not found", { agentId });
		return;
	}

	const before = persona.modelTier ?? "premium";
	const after = nextDowngradedTier(before);
	await store.setModelTier(agentId, after);

	const emit = deps.emitEvent ?? emitAgentEvent;
	await emit({
		agentId,
		eventType: "agent.downgraded",
		data: { beforeTier: before, afterTier: after },
	});

	const xClient = await (deps.getXClient ?? getAgentXClient)(agentId).catch((err) => {
		deps.logger.warn?.("[webhook-consumer] failed to load X client", {
			agentId,
			error: err instanceof Error ? err.message : String(err),
		});
		return null;
	});
	if (!xClient) return;

	await xClient.postTweet("running low on inference credits. downgrading to save juice.").catch((err) => {
		deps.logger.warn?.("[webhook-consumer] credits.low X post skipped", {
			agentId,
			error: err instanceof Error ? err.message : String(err),
		});
	});
}

async function handleCreditsDepleted(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
): Promise<void> {
	const store = deps.personaStore ?? createDefaultPersonaStore();
	const persona = await store.get(agentId);
	if (!persona) {
		deps.logger.warn?.("[webhook-consumer] credits.depleted persona not found", { agentId });
		return;
	}

	const emit = deps.emitEvent ?? emitAgentEvent;
	const now = new Date();

	if (!persona.lastWordsPostedAt) {
		const xClient = await (deps.getXClient ?? getAgentXClient)(agentId).catch((err) => {
			deps.logger.warn?.("[webhook-consumer] failed to load X client", {
				agentId,
				error: err instanceof Error ? err.message : String(err),
			});
			return null;
		});

		if (xClient) {
			const tweet = await xClient
				.postTweet("going dormant. patron can top me up anytime. see you on the other side.")
				.catch((err) => {
					deps.logger.warn?.("[webhook-consumer] last words X post skipped", {
						agentId,
						error: err instanceof Error ? err.message : String(err),
					});
					return null;
				});

			if (tweet) {
				await store.markLastWordsPosted(agentId, now);
				await emit({
					agentId,
					eventType: "agent.last_words_posted",
					data: { tweetId: tweet.id },
				});
			}
		}
	}

	await store.markDormant(agentId, now);
	await pauseAgentContainer(agentId, data, deps, "agent.credits.depleted").catch((err) => {
		deps.logger.warn?.("[webhook-consumer] credits.depleted pause skipped; runtime may already be stopped", {
			agentId,
			error: err instanceof Error ? err.message : String(err),
		});
	});
	await markRuntimeOverlayDormant(agentId, data, deps, now);
	await emit({
		agentId,
		eventType: "agent.dormant",
		data: {
			dormantAt: now.toISOString(),
			brainPausedAt: now.toISOString(),
			reason: "credits_depleted",
		},
	});
}

async function handleCreditsToppedUp(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
): Promise<void> {
	const now = new Date();
	const resume = await resumeAgentContainer(agentId, data, deps, "credits.topped_up");

	const db = consumerDb(deps);
	await db
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

	const overlayAgentId = stringField(data, "overlayAgentId");
	const overlay = runtimeOverlayAfterResume(data, resume?.runtimeStatus ?? null);
	if (overlayAgentId) {
		await db
			.update(agents)
			.set({ ...overlay.agent, updatedAt: now })
			.where(eq(agents.id, overlayAgentId));
	} else {
		const tokenAddress =
			stringField(data, "tokenAddress") ??
			stringField(data, "tokenContractAddress") ??
			(await resolvePersonaTokenAddress(agentId, db));
		if (!tokenAddress) return;
		const [overlay] = await db
			.select({ agentId: agents.id, tokenId: tokens.id })
			.from(tokens)
			.leftJoin(agents, eq(agents.tokenId, tokens.id))
			.where(sql`lower(${tokens.contractAddress}) = lower(${tokenAddress})`)
			.limit(1);
		if (overlay?.agentId) {
			await db
				.update(agents)
				.set({ ...runtimeOverlayAfterResume(data, resume?.runtimeStatus ?? null).agent, updatedAt: now })
				.where(eq(agents.id, overlay.agentId));
		}
		if (overlay?.tokenId) {
			await db
				.update(tokens)
				.set({
					agentStatus: runtimeOverlayAfterResume(data, resume?.runtimeStatus ?? null).tokenStatus,
					updatedAt: now,
				})
				.where(eq(tokens.id, overlay.tokenId));
		}
	}

	const emit = deps.emitEvent ?? emitAgentEvent;
	await emit({
		agentId,
		eventType: "agent.resurrected",
		data: {
			sourceEvent: "credits.topped_up",
			creditsAmount:
				numberField(data, "amount") || numberField(data, "amountUsd") || numberField(data, "creditsAmount"),
			resurrectedAt: now.toISOString(),
		},
	});
}

async function resolvePersonaTokenAddress(agentId: string, db = getDatabase().db): Promise<string | null> {
	const [persona] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	return persona?.tokenAddress ?? null;
}

async function markRuntimeOverlayDormant(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
	now: Date,
): Promise<void> {
	const overlayAgentId = stringField(data, "overlayAgentId");
	const explicitTokenAddress = stringField(data, "tokenAddress") ?? stringField(data, "tokenContractAddress");
	if (!overlayAgentId && !explicitTokenAddress && !deps.db) return;
	const db = consumerDb(deps);
	const values = {
		agentStatus: "suspended",
		lifecycleState: "dormant",
		suspendedReason: "credits_depleted",
		updatedAt: now,
	};
	if (overlayAgentId) {
		await db.update(agents).set(values).where(eq(agents.id, overlayAgentId));
		return;
	}
	const tokenAddress = explicitTokenAddress ?? (await resolvePersonaTokenAddress(agentId, db));
	if (!tokenAddress) return;
	const [overlay] = await db
		.select({ agentId: agents.id, tokenId: tokens.id })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${tokenAddress})`)
		.limit(1);
	if (overlay?.agentId) {
		await db.update(agents).set(values).where(eq(agents.id, overlay.agentId));
	}
	if (overlay?.tokenId) {
		await db.update(tokens).set({ agentStatus: "suspended", updatedAt: now }).where(eq(tokens.id, overlay.tokenId));
	}
}

async function pauseAgentContainer(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
	sourceEvent: string,
): Promise<void> {
	const runtimeId = await resolveElizaCloudRuntimeId(agentId, data);
	if (!runtimeId) {
		deps.logger.warn?.("[webhook-consumer] runtime id not found; cannot pause eliza cloud agent", {
			agentId,
			sourceEvent,
		});
		return;
	}
	await deps.elizaCloud.pauseAgent(runtimeId);
}

async function resumeAgentContainer(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
	sourceEvent: string,
): Promise<{ runtimeId: string; runtimeStatus: ElizaAgentRuntimeStatus | null } | null> {
	const runtimeId = await resolveElizaCloudRuntimeId(agentId, data);
	if (!runtimeId) {
		deps.logger.warn?.("[webhook-consumer] runtime id not found; cannot resume eliza cloud agent", {
			agentId,
			sourceEvent,
		});
		return null;
	}
	await deps.elizaCloud.resumeAgent(runtimeId);
	const runtimeStatus = deps.elizaCloud.getAgentRuntimeStatus
		? await deps.elizaCloud.getAgentRuntimeStatus(runtimeId)
		: null;
	return { runtimeId, runtimeStatus };
}

async function resolveElizaCloudRuntimeId(agentId: string, data: Record<string, unknown>): Promise<string | null> {
	const eventRuntimeId =
		stringField(data, "cloudAgentId") ??
		stringField(data, "elizaCloudAgentId") ??
		stringField(data, "runtimeAgentId") ??
		stringField(data, "containerId") ??
		stringField(data, "cloudContainerId") ??
		stringField(data, "elizaContainerId");
	if (eventRuntimeId) return eventRuntimeId;

	const db = getDatabase().db;
	const [persona] = await db
		.select({
			metadata: agentPersonas.metadata,
			tokenAddress: agentPersonas.tokenAddress,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	if (!persona) return null;

	const metadata = recordFromUnknown(persona.metadata);
	const provisioning = recordFromUnknown(metadata?.provisioning);
	const metadataRuntimeId = provisioning
		? (stringField(provisioning, "cloudAgentId") ??
			stringField(provisioning, "runtimeAgentId") ??
			stringField(provisioning, "containerId"))
		: null;
	if (metadataRuntimeId) return metadataRuntimeId;
	if (!persona.tokenAddress) return null;

	const [overlay] = await db
		.select({ containerId: agents.bridgeUrl, cloudAgentId: agents.cloudAgentId })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${persona.tokenAddress})`)
		.limit(1);
	return overlay?.cloudAgentId ?? overlay?.containerId ?? null;
}

function runtimeOverlayAfterResume(
	data: Record<string, unknown>,
	status: ElizaAgentRuntimeStatus | null,
): {
	agent: {
		agentStatus: string;
		lifecycleState: string;
		webUiUrl?: string | null;
		bridgeUrl?: string | null;
		suspendedReason: null;
	};
	tokenStatus: string;
} {
	const rawStatus = status?.status ?? "running";
	const agentStatus = isHostedRuntimeRunning(rawStatus) ? "running" : rawStatus;
	return {
		agent: {
			agentStatus,
			lifecycleState: agentStatus === "running" ? "live" : "reviving",
			...((status?.webUiUrl ?? status?.containerUrl ?? stringField(data, "webUiUrl", "containerUrl"))
				? { webUiUrl: status?.webUiUrl ?? status?.containerUrl ?? stringField(data, "webUiUrl", "containerUrl") }
				: {}),
			...((status?.containerId ?? stringField(data, "containerId"))
				? { bridgeUrl: status?.containerId ?? stringField(data, "containerId") }
				: {}),
			suspendedReason: null,
		},
		tokenStatus: agentStatus,
	};
}

function isHostedRuntimeRunning(status: string | null | undefined): boolean {
	return ["running", "ready", "online", "active", "started"].includes(String(status ?? "").toLowerCase());
}

function consumerDb(deps: WebhookConsumerDeps): Database {
	return deps.db ?? getDatabase().db;
}

function nextDowngradedTier(tier: ModelTier): ModelTier {
	if (tier === "premium") return "standard";
	if (tier === "standard") return "free";
	return "free";
}

function createDefaultPersonaStore(): WebhookConsumerPersonaStore {
	return {
		async get(agentId) {
			const db = getDatabase().db;
			const [row] = await db
				.select({
					agentId: agentPersonas.agentId,
					modelTier: agentPersonas.modelTier,
					lastWordsPostedAt: agentPersonas.lastWordsPostedAt,
				})
				.from(agentPersonas)
				.where(eq(agentPersonas.agentId, agentId))
				.limit(1);
			return row ?? null;
		},
		async setModelTier(agentId, tier) {
			const db = getDatabase().db;
			await db
				.update(agentPersonas)
				.set({ modelTier: tier, updatedAt: new Date() })
				.where(eq(agentPersonas.agentId, agentId));
		},
		async markLastWordsPosted(agentId, now) {
			const db = getDatabase().db;
			await db
				.update(agentPersonas)
				.set({ lastWordsPostedAt: now, updatedAt: now })
				.where(eq(agentPersonas.agentId, agentId));
		},
		async markDormant(agentId, now) {
			const db = getDatabase().db;
			await db
				.update(agentPersonas)
				.set({
					dormantAt: now,
					brainPausedAt: now,
					brainPausedReason: "credits_depleted",
					updatedAt: now,
				})
				.where(eq(agentPersonas.agentId, agentId));
		},
	};
}

function stringField(data: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = data[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function numberField(data: Record<string, unknown>, key: string): number {
	const value = data[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
