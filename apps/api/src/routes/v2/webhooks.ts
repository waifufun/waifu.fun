import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDatabase, webhookInbox } from "@waifufun/db";

import { type ElizaCloudClient, createElizaCloudClient } from "../../services/eliza-client.js";
import { type WebhookConsumerEvent, dispatchEvent } from "../../services/webhook-consumer/index.js";

type Logger = Console;
type Db = ReturnType<typeof getDatabase>["db"];

type WebhookRoutesOptions = {
	db?: Db;
	secret?: string;
	maxSkewMs?: number;
	elizaCloud?: ElizaCloudClient;
	logger?: Logger;
	dispatch?: typeof dispatchEvent;
};

const app = createWebhookRoutes();
const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = "sha256=";

export function createWebhookRoutes(options: WebhookRoutesOptions = {}) {
	const routes = new Hono();

	routes.post("/agent-events", async (c) => {
		const expectedSecret = options.secret ?? process.env.WEBHOOK_RECEIVER_SECRET;
		if (!expectedSecret) {
			return c.json({ error: "unauthorized" }, 401);
		}

		const rawBody = await c.req.text();
		let payload: WebhookConsumerEvent;
		try {
			payload = validatePayload(JSON.parse(rawBody));
		} catch (err) {
			return c.json(
				{
					error: "invalid webhook payload",
					detail: err instanceof Error ? err.message : String(err),
				},
				400,
			);
		}

		const authError = verifyWebhookRequest({
			rawBody,
			payload,
			secret: expectedSecret,
			signature: c.req.header("X-Waifu-Webhook-Signature"),
			maxSkewMs: options.maxSkewMs ?? DEFAULT_MAX_SKEW_MS,
		});
		if (authError) {
			return c.json({ error: "unauthorized", detail: authError }, 401);
		}

		const db = options.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const duplicate = await insertInboxRow(db, payload);
			if (duplicate) {
				return c.json({ status: "ok", duplicate: true }, 200);
			}

			const logger = options.logger ?? console;
			const elizaCloud =
				options.elizaCloud ??
				createElizaCloudClient({
					baseUrl: process.env.ELIZA_CLOUD_BASE_URL ?? "",
					apiKey: process.env.ELIZA_CLOUD_API_KEY ?? "",
					logger,
				});

			try {
				await (options.dispatch ?? dispatchEvent)(payload, { elizaCloud, logger });
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

export function signWebhookPayload(rawBody: string, timestamp: string, secret: string): string {
	return `${SIGNATURE_PREFIX}${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function verifyWebhookRequest(args: {
	rawBody: string;
	payload: WebhookConsumerEvent;
	secret: string;
	signature: string | undefined;
	maxSkewMs: number;
}): string | null {
	if (!args.payload.idempotencyKey) return "idempotencyKey is required";

	const eventTime = Date.parse(args.payload.timestamp);
	const skew = Math.abs(Date.now() - eventTime);
	if (!Number.isFinite(eventTime) || skew > args.maxSkewMs) return "webhook timestamp is outside the allowed window";

	if (!args.signature?.startsWith(SIGNATURE_PREFIX)) return "webhook signature is required";
	const expected = signWebhookPayload(args.rawBody, args.payload.timestamp, args.secret);
	const expectedBytes = Buffer.from(expected);
	const actualBytes = Buffer.from(args.signature);
	if (actualBytes.length !== expectedBytes.length) return "webhook signature is invalid";
	return timingSafeEqual(actualBytes, expectedBytes) ? null : "webhook signature is invalid";
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
	if (typeof idempotencyKey === "string" && idempotencyKey.trim().length === 0) {
		throw new Error("idempotencyKey must be non-empty when provided");
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
