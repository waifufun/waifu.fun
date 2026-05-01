import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDatabase, webhookInbox } from "@waifufun/db";

import { type MiladyCloudClient, createMiladyCloudClient } from "../../services/milady-client.js";
import { type WebhookConsumerEvent, dispatchEvent } from "../../services/webhook-consumer/index.js";

type Logger = Console;
type Db = ReturnType<typeof getDatabase>["db"];

type WebhookRoutesOptions = {
	db?: Db;
	secret?: string;
	miladyCloud?: MiladyCloudClient;
	logger?: Logger;
	dispatch?: typeof dispatchEvent;
};

const app = createWebhookRoutes();

export function createWebhookRoutes(options: WebhookRoutesOptions = {}) {
	const routes = new Hono();

	routes.post("/agent-events", async (c) => {
		const expectedSecret = options.secret ?? process.env.WEBHOOK_RECEIVER_SECRET;
		const providedSecret = c.req.header("X-Waifu-Webhook-Secret");
		if (!expectedSecret || providedSecret !== expectedSecret) {
			return c.json({ error: "unauthorized" }, 401);
		}

		let payload: WebhookConsumerEvent;
		try {
			payload = validatePayload(await c.req.json());
		} catch (err) {
			return c.json(
				{
					error: "invalid webhook payload",
					detail: err instanceof Error ? err.message : String(err),
				},
				400,
			);
		}

		const db = options.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const duplicate = await insertInboxRow(db, payload);
			if (duplicate) {
				return c.json({ status: "ok", duplicate: true }, 200);
			}

			const logger = options.logger ?? console;
			const miladyCloud =
				options.miladyCloud ??
				createMiladyCloudClient({
					baseUrl: process.env.MILADY_CLOUD_BASE_URL ?? "",
					apiKey: process.env.MILADY_CLOUD_API_KEY ?? "",
					logger,
				});

			try {
				await (options.dispatch ?? dispatchEvent)(payload, { miladyCloud, logger });
			} catch (err) {
				logger.error?.("[webhooks] internal dispatch failed", {
					event: payload.event,
					agentId: payload.agentId,
					err: err instanceof Error ? err.message : String(err),
				});
			}

			return c.json({ status: "accepted", duplicate: false }, 202);
		} catch (err) {
			return c.json(
				{
					error: "failed to receive webhook",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	return routes;
}

function requireDb(): Db | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export async function insertInboxRow(db: Db, payload: WebhookConsumerEvent): Promise<boolean> {
	const key = payload.idempotencyKey ?? null;

	if (key) {
		const [existing] = await db
			.select({ id: webhookInbox.id })
			.from(webhookInbox)
			.where(eq(webhookInbox.key, key))
			.limit(1);
		if (existing) return true;
	}

	await db.insert(webhookInbox).values({ key, eventType: payload.event });
	return false;
}

export function validatePayload(value: unknown): WebhookConsumerEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("payload must be an object");
	}

	const input = value as Record<string, unknown>;
	const event = input.event;
	const timestamp = input.timestamp;
	const agentId = input.agentId;
	const data = input.data;
	const idempotencyKey = input.idempotencyKey;

	if (typeof event !== "string" || event.length === 0) {
		throw new Error("event must be a non-empty string");
	}
	if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
		throw new Error("timestamp must be an ISO date string");
	}
	if (agentId !== null && typeof agentId !== "string") {
		throw new Error("agentId must be a string or null");
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error("data must be an object");
	}
	if (idempotencyKey !== undefined && typeof idempotencyKey !== "string") {
		throw new Error("idempotencyKey must be a string when provided");
	}

	return {
		event,
		timestamp,
		agentId,
		data: data as Record<string, unknown>,
		...(idempotencyKey ? { idempotencyKey } : {}),
	};
}

export default app;
