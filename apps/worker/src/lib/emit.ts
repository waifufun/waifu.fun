import { createHmac } from "node:crypto";

import { type AgentEvent, type AgentEventType, agentEvents, isAgentEventType, renderEventData } from "@waifufun/db";
import { logAgentEventToLoki } from "@waifufun/logger";

import type { WorkerDbClient } from "./types.js";
export interface EmitAgentEventInput {
	db: WorkerDbClient;
	eventType: AgentEventType;
	agentId?: string | null;
	tokenAddress?: string | null;
	data?: Record<string, unknown>;
	source?: string;
	sourceEventId?: string;
	correlationId?: string | null;
	occurredAt?: Date;
	status?: "pending" | "processing" | "done" | "failed" | "skipped";
}
export async function emitAgentEvent(input: EmitAgentEventInput): Promise<AgentEvent> {
	if (!isAgentEventType(input.eventType)) throw new Error(`invalid agent event type: ${input.eventType}`);
	const rawData = input.data ?? {};
	const source = input.source ?? stringField(rawData, "source") ?? "worker";
	const sourceEventId =
		input.sourceEventId ??
		stringField(rawData, "sourceEventId") ??
		`${source}:${input.eventType}:${input.agentId ?? input.tokenAddress ?? "unknown"}:${stringField(rawData, "txHash") ?? Date.now()}`;
	const data = renderEventData(input.eventType, rawData);
	const [row] = await input.db
		.insert(agentEvents)
		.values({
			agentId: input.agentId ?? null,
			eventType: input.eventType,
			data,
			source,
			sourceEventId,
			correlationId: input.correlationId ?? stringField(rawData, "correlationId"),
			occurredAt: input.occurredAt ?? new Date(),
			txHash: stringField(data, "txHash"),
			blockNumber: stringField(data, "blockNumber"),
			chainId: stringField(data, "chainId"),
			tokenAddress: input.tokenAddress ? input.tokenAddress.toLowerCase() : null,
			type: input.eventType,
			payload: data,
			status: input.status ?? "done",
		})
		.returning();
	if (!row) throw new Error("emitAgentEvent: insert returned no row");
	fanoutAgentEventToLoki(row);
	const urls = parseWebhookUrls();
	if (urls.length > 0) {
		const payload = {
			id: row.id,
			event: row.eventType,
			timestamp: row.createdAt.toISOString(),
			agentId: row.agentId,
			data: row.data,
			idempotencyKey: row.id,
		};
		const body = JSON.stringify(payload);
		const secret = getWebhookSigningSecret();
		if (!secret) return row;
		const signature = signWebhookPayload(body, payload.timestamp, secret);
		await Promise.allSettled(
			urls.map((url) =>
				fetch(url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"X-Waifu-Event": row.eventType,
						"X-Waifu-Event-Id": row.id,
						"X-Waifu-Timestamp": payload.timestamp,
						"X-Waifu-Webhook-Signature": signature,
						"X-Waifu-Signature": signature,
					},
					body,
				}),
			),
		);
	}
	return row;
}
function fanoutAgentEventToLoki(row: AgentEvent): void {
	if (process.env.LOG_AGENT_EVENTS_TO_LOKI !== "true") return;

	logAgentEventToLoki({
		service: "waifu-worker",
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
			dataJson: stringifyForLoki(row.data),
		},
	});
}

function stringifyForLoki(data: Record<string, unknown>): string {
	try {
		return JSON.stringify(data);
	} catch {
		return "{}";
	}
}

function parseWebhookUrls(raw = process.env.WEBHOOK_URLS ?? ""): string[] {
	return raw
		.split(/[\n,]/)
		.map((url) => url.trim())
		.filter(Boolean);
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

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" ? value : null;
}
