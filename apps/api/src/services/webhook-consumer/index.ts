import { agentPersonas, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import type { Address } from "viem";

import { emitAgentEvent } from "../events/emit.js";
import {
	type AgentSpec,
	type Logger,
	type MiladyCloudClient,
	MiladyCloudNotConfiguredError,
} from "../milady-client.js";
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
	miladyCloud: MiladyCloudClient;
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
				await deps.miladyCloud.provisionAgent({
					agentId: event.agentId,
					spec: buildAgentSpec(event.agentId, event.data),
				});
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
				await handleCreditsDepleted(event.agentId, deps);
				return;
			}
			case "agent.kill_activated":
			case "agent.killed": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] kill event missing agentId", { event });
					return;
				}
				await deps.miladyCloud.pauseAgent(event.agentId);
				return;
			}
			case "agent.revived":
			case "agent.resumed": {
				if (!event.agentId) {
					logger.warn?.("[webhook-consumer] revive event missing agentId", { event });
					return;
				}
				await deps.miladyCloud.resumeAgent(event.agentId);
				return;
			}
			default:
				logger.info?.("[webhook-consumer] ignored event", { eventType: event.event });
				return;
		}
	} catch (err) {
		if (err instanceof MiladyCloudNotConfiguredError) {
			logger.warn?.("[webhook-consumer] milady cloud not configured; skipping", {
				eventType: event.event,
				agentId: event.agentId,
			});
			return;
		}

		if (event.event === "agent.claimed" && event.agentId) {
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

async function handleCreditsDepleted(agentId: string, deps: WebhookConsumerDeps): Promise<void> {
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

function buildAgentSpec(agentId: string, data: Record<string, unknown>): AgentSpec {
	return {
		personaId: stringField(data, "personaId") ?? agentId,
		xHandle: stringField(data, "xHandle") ?? stringField(data, "claimedByXHandle"),
		taxConfig: data.taxConfig ?? null,
		safeAddress: addressField(data, "safeAddress"),
	};
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(data: Record<string, unknown>, key: string): number {
	const value = data[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addressField(data: Record<string, unknown>, key: string): Address | null {
	const value = data[key];
	if (typeof value !== "string") return null;
	return /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}
