import { createHmac, timingSafeEqual } from "node:crypto";

import { type Context, Hono } from "hono";

import { agentPersonas, getDatabase, webhookInbox } from "@waifufun/db";
import { eq, or } from "drizzle-orm";
import { emitAgentEvent } from "../../services/events/emit.js";

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

	routes.post("/steward/policy", async (c) => receiveDirectAgentEvent(c, options, "steward-webhook", mapStewardPolicy));
	routes.post("/steward/sign", async (c) => receiveDirectAgentEvent(c, options, "steward-webhook", mapStewardSign));
	routes.post("/eliza-cloud/credits", async (c) =>
		receiveDirectAgentEvent(c, options, "eliza-cloud-webhook", mapElizaCredits),
	);
	routes.post("/eliza-cloud/inference", async (c) =>
		receiveDirectAgentEvent(c, options, "eliza-cloud-webhook", mapElizaInference),
	);

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
					baseUrl: process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai",
					apiKey: process.env.ELIZA_CLOUD_API_KEY ?? "",
					serviceKey: process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY ?? "",
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
	const key = payload.idempotencyKey;
	if (!key) throw new Error("idempotencyKey is required");

	const [inserted] = await db
		.insert(webhookInbox)
		.values({ key, eventType: payload.event })
		.onConflictDoNothing({ target: webhookInbox.key })
		.returning({ id: webhookInbox.id });
	return !inserted;
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

type DirectMapResult = {
	eventType: import("@waifufun/db").AgentEventType;
	agentLookup?: string | null;
	data: Record<string, unknown>;
	sourceEventId: string;
	occurredAt?: Date;
};

type DirectMapper = (payload: Record<string, unknown>) => DirectMapResult;

async function receiveDirectAgentEvent(
	c: Context,
	options: WebhookRoutesOptions,
	source: string,
	mapper: DirectMapper,
) {
	const expectedSecret = options.secret ?? process.env.WEBHOOK_RECEIVER_SECRET;
	if (!expectedSecret) return c.json({ error: "unauthorized" }, 401);
	const rawBody = await c.req.text();
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		return c.json({ error: "invalid json" }, 400);
	}
	const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
	const authError = verifyWebhookRequest({
		rawBody,
		payload: { event: source, timestamp, agentId: null, data: body, idempotencyKey: directIdempotencyKey(body) },
		secret: expectedSecret,
		signature: c.req.header("X-Waifu-Webhook-Signature") ?? c.req.header("X-Waifu-Signature"),
		maxSkewMs: options.maxSkewMs ?? DEFAULT_MAX_SKEW_MS,
	});
	if (authError) return c.json({ error: "unauthorized", detail: authError }, 401);

	const db = options.db ?? requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	try {
		const mapped = mapper(body);
		const agentId = await resolveWebhookAgentId(db, mapped.agentLookup ?? stringField(body, "agentId"), source);
		await emitAgentEvent({
			agentId,
			eventType: mapped.eventType,
			data: { ...mapped.data, source },
			source,
			sourceEventId: mapped.sourceEventId,
			correlationId: stringField(mapped.data, "correlationId") ?? stringField(mapped.data, "safeTxHash"),
			occurredAt: mapped.occurredAt ?? new Date(timestamp),
		});
		return c.json({ status: "accepted" }, 202);
	} catch (err) {
		return c.json(
			{ error: "failed to receive webhook", detail: err instanceof Error ? err.message : String(err) },
			500,
		);
	}
}

async function resolveWebhookAgentId(
	db: Db,
	lookup: string | null | undefined,
	source: string,
): Promise<string | null> {
	if (!lookup) return null;
	const [row] = await db
		.select({ agentId: agentPersonas.agentId })
		.from(agentPersonas)
		.where(
			source === "steward-webhook"
				? or(eq(agentPersonas.stewardAgentId, lookup), eq(agentPersonas.agentId, lookup))
				: or(eq(agentPersonas.elizaCloudAgentId, lookup), eq(agentPersonas.agentId, lookup)),
		)
		.limit(1);
	return row?.agentId ?? lookup;
}

function mapStewardPolicy(payload: Record<string, unknown>): DirectMapResult {
	const decision = stringField(payload, "decision") ?? stringField(payload, "status") ?? "applied";
	const eventType =
		decision === "denied" ? "policy.denied" : decision === "needs_manual" ? "policy.needs_manual" : "policy.applied";
	return {
		eventType,
		agentLookup: stringField(payload, "agentId", "stewardAgentId"),
		data: payload,
		sourceEventId: `steward:${stringField(payload, "decisionId", "eventId") ?? crypto.randomUUID()}`,
	};
}

function mapStewardSign(payload: Record<string, unknown>): DirectMapResult {
	return {
		eventType: "safe.tx.signed",
		agentLookup: stringField(payload, "agentId", "stewardAgentId"),
		data: payload,
		sourceEventId: `steward:${stringField(payload, "signatureId", "safeTxHash", "eventId") ?? crypto.randomUUID()}`,
	};
}

function mapElizaCredits(payload: Record<string, unknown>): DirectMapResult {
	return {
		eventType: "credits.topped_up",
		agentLookup: stringField(payload, "agentId", "elizaCloudAgentId"),
		data: payload,
		sourceEventId: `eliza:${stringField(payload, "eventId", "creditId") ?? crypto.randomUUID()}`,
	};
}

function mapElizaInference(payload: Record<string, unknown>): DirectMapResult {
	return {
		eventType: "inference.spent",
		agentLookup: stringField(payload, "agentId", "elizaCloudAgentId"),
		data: payload,
		sourceEventId: `eliza:${stringField(payload, "eventId", "inferenceId") ?? crypto.randomUUID()}`,
	};
}

function directIdempotencyKey(payload: Record<string, unknown>): string {
	return stringField(payload, "idempotencyKey", "eventId", "decisionId", "signatureId") ?? crypto.randomUUID();
}

function stringField(payload: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
}

export default app;
