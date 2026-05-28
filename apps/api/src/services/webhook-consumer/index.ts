import { agentPersonas, agents, getDatabase, tokens } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import { type ElizaCloudClient, ElizaCloudNotConfiguredError, type Logger } from "../eliza-client.js";
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
	await pauseAgentContainer(agentId, data, deps, "agent.credits.depleted");
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
	await resumeAgentContainer(agentId, data, deps, "credits.topped_up");

	const db = getDatabase().db;
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

	const tokenAddress =
		stringField(data, "tokenAddress") ??
		stringField(data, "tokenContractAddress") ??
		(await resolvePersonaTokenAddress(agentId));
	const overlayAgentId = stringField(data, "overlayAgentId");
	if (overlayAgentId) {
		await db
			.update(agents)
			.set({ agentStatus: "running", lifecycleState: "live", suspendedReason: null, updatedAt: now })
			.where(eq(agents.id, overlayAgentId));
	} else if (tokenAddress) {
		const [overlay] = await db
			.select({ agentId: agents.id, tokenId: tokens.id })
			.from(tokens)
			.leftJoin(agents, eq(agents.tokenId, tokens.id))
			.where(sql`lower(${tokens.contractAddress}) = lower(${tokenAddress})`)
			.limit(1);
		if (overlay?.agentId) {
			await db
				.update(agents)
				.set({ agentStatus: "running", lifecycleState: "live", suspendedReason: null, updatedAt: now })
				.where(eq(agents.id, overlay.agentId));
		}
		if (overlay?.tokenId) {
			await db.update(tokens).set({ agentStatus: "running", updatedAt: now }).where(eq(tokens.id, overlay.tokenId));
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

async function resolvePersonaTokenAddress(agentId: string): Promise<string | null> {
	const db = getDatabase().db;
	const [persona] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	return persona?.tokenAddress ?? null;
}

async function pauseAgentContainer(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
	sourceEvent: string,
): Promise<void> {
	const containerId = await resolveContainerId(agentId, data);
	if (!containerId) {
		deps.logger.warn?.("[webhook-consumer] container id not found; cannot pause eliza cloud container", {
			agentId,
			sourceEvent,
		});
		return;
	}
	await deps.elizaCloud.pauseAgent(containerId);
}

async function resumeAgentContainer(
	agentId: string,
	data: Record<string, unknown>,
	deps: WebhookConsumerDeps,
	sourceEvent: string,
): Promise<void> {
	const containerId = await resolveContainerId(agentId, data);
	if (!containerId) {
		deps.logger.warn?.("[webhook-consumer] container id not found; cannot resume eliza cloud container", {
			agentId,
			sourceEvent,
		});
		return;
	}
	await deps.elizaCloud.resumeAgent(containerId);
}

async function resolveContainerId(agentId: string, data: Record<string, unknown>): Promise<string | null> {
	const eventContainerId =
		stringField(data, "containerId") ??
		stringField(data, "cloudContainerId") ??
		stringField(data, "elizaContainerId") ??
		stringField(data, "cloudAgentId") ??
		stringField(data, "runtimeAgentId");
	if (eventContainerId) return eventContainerId;

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
	const metadataContainerId = provisioning
		? (stringField(provisioning, "containerId") ??
			stringField(provisioning, "cloudAgentId") ??
			stringField(provisioning, "runtimeAgentId"))
		: null;
	if (metadataContainerId) return metadataContainerId;
	if (!persona.tokenAddress) return null;

	const [overlay] = await db
		.select({ containerId: agents.bridgeUrl, cloudAgentId: agents.cloudAgentId })
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(sql`lower(${tokens.contractAddress}) = lower(${persona.tokenAddress})`)
		.limit(1);
	return overlay?.containerId ?? overlay?.cloudAgentId ?? null;
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

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function numberField(data: Record<string, unknown>, key: string): number {
	const value = data[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
