import type { Job } from "bullmq";

import { type NotificationJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext } from "../lib/types.js";

export function createNotificationProcessor(context: WorkerContext) {
	return async (job: Job<NotificationJob>) => {
		const payload = parseJobPayload("notification", job.data);
		const kind = typeof payload.payload.kind === "string" ? payload.payload.kind : payload.channel;

		context.logger.info(
			{
				jobId: job.id,
				type: payload.type,
				audience: payload.audience,
				channel: payload.channel,
				referenceId: payload.referenceId,
				kind,
			},
			"notification starting",
		);

		try {
			let dispatched = false;
			let statusCode: number | null = null;

			if (kind === "discord" || payload.channel === "discord") {
				const url = process.env.DISCORD_OPS_WEBHOOK_URL;
				if (url) {
					const response = await fetch(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							content: formatNotificationMessage(payload),
							embeds: [
								{
									title: payload.type,
									description: payload.referenceId ?? "worker notification",
									fields: objectFields(payload.payload),
								},
							],
						}),
					});
					statusCode = response.status;
					if (!response.ok) {
						await emitAgentEvent({
							eventType: "system.notification_failed",
							agentId: null,
							db: context.db,
							data: {
								type: payload.type,
								kind,
								channel: payload.channel,
								referenceId: payload.referenceId ?? null,
								statusCode,
							},
						});
						throw new Error(`discord notification failed: ${response.status} ${response.statusText}`);
					}
					dispatched = true;
				} else {
					context.logger.info(
						{ jobId: job.id, type: payload.type },
						"DISCORD_OPS_WEBHOOK_URL not set; notification logged only",
					);
				}
			} else {
				context.logger.info({ jobId: job.id, type: payload.type, kind }, "notification logged only");
			}

			await emitAgentEvent({
				eventType: "system.notification_dispatched",
				agentId: null,
				db: context.db,
				data: {
					type: payload.type,
					kind,
					channel: payload.channel,
					audience: payload.audience,
					referenceId: payload.referenceId ?? null,
					dispatched,
					statusCode,
					payload: payload.payload,
				},
			});

			return {
				status: "completed",
				dispatched,
				type: payload.type,
				channel: payload.channel,
				audience: payload.audience,
				referenceId: payload.referenceId,
				kind,
				statusCode,
			};
		} catch (error) {
			context.logger.error(
				{
					jobId: job.id,
					type: payload.type,
					channel: payload.channel,
					error: error instanceof Error ? error.message : String(error),
				},
				"notification failed",
			);
			throw error;
		}
	};
}

function formatNotificationMessage(payload: NotificationJob): string {
	return `[${payload.audience}] ${payload.type}${payload.referenceId ? ` (${payload.referenceId})` : ""}`;
}

function objectFields(payload: Record<string, unknown>) {
	return Object.entries(payload)
		.slice(0, 20)
		.map(([name, value]) => ({
			name,
			value: typeof value === "string" ? value : JSON.stringify(value),
			inline: false,
		}));
}
