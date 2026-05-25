import { createHmac } from "node:crypto";

import {
	type AgentEvent,
	type AgentEventType,
	type NewAgentEvent,
	agentEvents,
	getDatabase,
	isAgentEventType,
	renderEventData,
} from "@waifufun/db";
import { logAgentEventToLoki } from "@waifufun/logger";
import { agentActionsTotal, agentEventsTotal, agentInferenceCostUsdTotal, agentXPostsTotal } from "@waifufun/metrics";

import { dispatchAgentEventAlert } from "../alerts/event-consumer.js";

export type EmitAgentEventInput = Omit<NewAgentEvent, "type" | "payload"> &
	Partial<Pick<NewAgentEvent, "type" | "payload">>;

export interface AgentEventWebhookPayload {
	id: string;
	event: AgentEventType;
	timestamp: string;
	agentId: string | null;
	data: Record<string, unknown>;
	idempotencyKey: string;
}

const LEGACY_QUEUE_TYPE_BY_EVENT_TYPE: Partial<Record<AgentEventType, string>> = {
	"token.created": "agent.created",
	"token.purchased": "agent.trade.buy",
	"token.sold": "agent.trade.sell",
	"agent.graduated": "agent.graduated",
};

export function parseWebhookUrls(raw = process.env.WEBHOOK_URLS ?? ""): string[] {
	return raw
		.split(/[\n,]/)
		.map((url) => url.trim())
		.filter((url) => url.length > 0);
}

export function buildWebhookPayload(row: AgentEvent): AgentEventWebhookPayload {
	return {
		id: row.id,
		event: row.eventType,
		timestamp: row.createdAt.toISOString(),
		agentId: row.agentId,
		data: row.data,
		idempotencyKey: row.id,
	};
}

export function getWebhookSigningSecret(
	raw = process.env.WEBHOOK_SIGNING_SECRET ?? process.env.WEBHOOK_RECEIVER_SECRET ?? "",
): string | null {
	const secret = raw.trim();
	return secret.length > 0 ? secret : null;
}

export function signWebhookPayload(rawBody: string, timestamp: string, secret: string): string {
	return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function buildWebhookHeaders(
	payload: AgentEventWebhookPayload,
	body: string,
	secret: string,
): Record<string, string> {
	const signature = signWebhookPayload(body, payload.timestamp, secret);
	return {
		"content-type": "application/json",
		"X-Waifu-Event": payload.event,
		"X-Waifu-Event-Id": payload.id,
		"X-Waifu-Timestamp": payload.timestamp,
		"X-Waifu-Webhook-Signature": signature,
		"X-Waifu-Signature": signature,
	};
}

export function normalizeAgentEventInput(input: EmitAgentEventInput): NewAgentEvent {
	if (!isAgentEventType(input.eventType)) {
		throw new Error(`invalid agent event type: ${input.eventType}`);
	}

	const rawData = input.data ?? recordFromUnknown(input.payload) ?? {};
	const source = input.source ?? stringField(rawData, "source") ?? "api";
	const sourceEventId =
		input.sourceEventId ??
		stringField(rawData, "sourceEventId") ??
		stringField(rawData, "source_event_id") ??
		`${source}:${input.eventType}:${input.agentId ?? input.tokenAddress ?? "unknown"}:${stringField(rawData, "txHash") ?? Date.now()}`;
	const data = renderEventData(input.eventType, rawData);
	const txHash = input.txHash ?? stringField(data, "txHash");
	const blockNumber = input.blockNumber ?? stringField(data, "blockNumber");
	const chainId = input.chainId ?? stringField(data, "chainId");

	return {
		...input,
		eventType: input.eventType,
		data,
		txHash,
		blockNumber,
		chainId,
		source,
		sourceEventId,
		correlationId: input.correlationId ?? stringField(rawData, "correlationId"),
		occurredAt:
			input.occurredAt ??
			(stringField(rawData, "occurredAt") ? new Date(stringField(rawData, "occurredAt") as string) : new Date()),
		type: input.type ?? LEGACY_QUEUE_TYPE_BY_EVENT_TYPE[input.eventType] ?? input.eventType,
		payload: input.payload ?? data,
		// API-originated activity rows are feed/webhook records, not brain-worker queue work.
		// Existing indexer enqueue paths keep the schema default of `pending` via @waifufun/db queries.
		status: input.status ?? "done",
	};
}

export async function emitAgentEvent(input: NewAgentEvent): Promise<AgentEvent>;
export async function emitAgentEvent(input: EmitAgentEventInput): Promise<AgentEvent>;
export async function emitAgentEvent(input: EmitAgentEventInput): Promise<AgentEvent> {
	const [row] = await emitAgentEventBatch([input]);
	if (!row) {
		throw new Error("emitAgentEvent: insert returned no row");
	}
	return row;
}

export async function emitAgentEventBatch(rows: NewAgentEvent[]): Promise<AgentEvent[]>;
export async function emitAgentEventBatch(rows: EmitAgentEventInput[]): Promise<AgentEvent[]>;
export async function emitAgentEventBatch(rows: EmitAgentEventInput[]): Promise<AgentEvent[]> {
	if (rows.length === 0) return [];

	const values = rows.map(normalizeAgentEventInput);
	const { db } = getDatabase();
	const inserted = await db.insert(agentEvents).values(values).returning();

	for (const row of inserted) {
		fanoutAgentEventToLoki(row);
		recordAgentEventMetrics(row);
	}

	await Promise.all(inserted.map((row) => fanoutWebhook(row)));
	await Promise.all(inserted.map((row) => dispatchAgentEventAlert(row)));

	return inserted;
}

function fanoutAgentEventToLoki(row: AgentEvent): void {
	if (process.env.LOG_AGENT_EVENTS_TO_LOKI !== "true") return;

	logAgentEventToLoki({
		service: "waifu-api",
		lokiUrl: process.env.LOKI_URL,
		lokiUser: process.env.LOKI_USER,
		lokiToken: process.env.LOKI_TOKEN,
		agentId: row.agentId,
		eventType: row.eventType,
		timestamp: row.createdAt,
		line: {
			message: "agent event emitted",
			eventId: row.id,
			eventType: row.eventType,
			agentId: row.agentId,
			tokenAddress: row.tokenAddress,
			data: row.data,
		},
	});
}

export function recordAgentEventMetrics(row: AgentEvent): void {
	const agentId = row.agentId ?? "unknown";

	agentEventsTotal.inc({
		service: "api",
		agentId,
		eventType: row.eventType,
	});

	if (row.eventType.startsWith("action.")) {
		agentActionsTotal.inc({
			service: "api",
			agentId,
			adapter: stringField(row.data, "adapter") ?? stringField(row.data, "adapterSlug") ?? "unknown",
			action: stringField(row.data, "action") ?? row.eventType.slice("action.".length),
		});
	}

	if (row.eventType === "x.posted") {
		agentXPostsTotal.inc({ agentId });
	}

	if (row.eventType === "inference.spent") {
		const usd =
			numericField(row.data, "usd") ?? numericField(row.data, "costUsd") ?? numericField(row.data, "amountUsd");
		const cents =
			numericField(row.data, "cents") ?? numericField(row.data, "costCents") ?? numericField(row.data, "amountCents");
		agentInferenceCostUsdTotal.inc({ agentId }, usd ?? (cents === null ? 0 : cents / 100));
	}
}

async function fanoutWebhook(row: AgentEvent): Promise<void> {
	const urls = parseWebhookUrls();
	if (urls.length === 0) return;

	const payload = buildWebhookPayload(row);
	const body = JSON.stringify(payload);
	const secret = getWebhookSigningSecret();
	if (!secret) return;
	const headers = buildWebhookHeaders(payload, body, secret);

	await Promise.allSettled(
		urls.map((url) =>
			fetch(url, {
				method: "POST",
				headers,
				body,
			}),
		),
	);
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" ? value : null;
}

function numericField(data: Record<string, unknown>, key: string): number | null {
	const value = data[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}
