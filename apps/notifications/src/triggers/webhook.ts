/**
 * Webhook entrypoint.
 *
 * The W44 indexer (or the API) can POST a single launch state-change event
 * here to trigger an immediate dispatch instead of waiting for the next
 * poll tick. This module exposes a pure handler; wiring to an HTTP server
 * lives in `index.ts`.
 *
 * Request body:
 *   {
 *     "launch_id": "uuid",        // optional if vault_address present
 *     "vault_address": "0x...",   // optional if launch_id present
 *     "event_type": "launched",   // optional; if omitted, derive from row
 *     "context": { ... }          // optional event metadata (tranche label, etc)
 *   }
 *
 * Response:
 *   { "ok": true, "dispatched": [...] } | { "ok": false, "error": "..." }
 *
 * Auth lives in `index.ts` (Bearer NOTIFICATIONS_WEBHOOK_TOKEN).
 */

import type { AgentLaunchRow, LaunchNotificationEventType } from "@waifufun/db";

import { type DispatchResult, dispatchEvent } from "../lib/dispatcher.js";
import type { NotifierRuntime, PendingEvent } from "../lib/types.js";

import { deriveEvents } from "./poller.js";

export interface WebhookRequestBody {
	launch_id?: string;
	vault_address?: string;
	event_type?: LaunchNotificationEventType;
	context?: Record<string, unknown>;
}

export interface WebhookResponse {
	ok: boolean;
	error?: string;
	dispatched?: DispatchResult[];
}

export type LaunchLookup = (body: WebhookRequestBody) => Promise<AgentLaunchRow | null>;

export async function handleWebhook(
	runtime: NotifierRuntime,
	body: WebhookRequestBody,
	lookup: LaunchLookup,
): Promise<WebhookResponse> {
	const launch = await lookup(body);
	if (!launch) {
		return { ok: false, error: "launch not found" };
	}

	const now = runtime.now();
	const events: PendingEvent[] = body.event_type
		? [
				{
					launch,
					eventType: body.event_type,
					occurredAt: now,
					context: body.context ?? {},
				},
			]
		: deriveEvents(launch, now, runtime.config.summaryDelayMs);

	const dispatched: DispatchResult[] = [];
	for (const event of events) {
		dispatched.push(await dispatchEvent(runtime, event));
	}
	return { ok: true, dispatched };
}
