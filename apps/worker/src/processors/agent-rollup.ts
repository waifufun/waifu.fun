import type { Job } from "bullmq";
import { and, eq, gte } from "drizzle-orm";

import { agentEvents } from "@waifufun/db";
import { agentDailyBurnUsd, agentRunwayDays, agentTreasuryUsd } from "@waifufun/metrics";
import { type AgentRollupJob, parseJobPayload } from "@waifufun/queue";

import type { WorkerContext } from "../lib/types.js";

const PLACEHOLDER_DAILY_BURN_USD = 5;

export function createAgentRollupProcessor(context: WorkerContext) {
	return async (job: Job<AgentRollupJob>) => {
		const payload = parseJobPayload("agent-rollup", job.data);
		const agents = await context.db.listActiveAgents(payload.limit);
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

		let updated = 0;
		for (const agent of agents) {
			const treasuryUsd = parseUsd(agent.cachedBalance) ?? 0;
			const inferenceSpendUsd = await readInferenceSpendUsd(context, agent.id, since);
			const dailyBurnUsd = inferenceSpendUsd > 0 ? inferenceSpendUsd : PLACEHOLDER_DAILY_BURN_USD;
			const runwayDays = dailyBurnUsd === 0 ? Number.POSITIVE_INFINITY : treasuryUsd / dailyBurnUsd;

			agentTreasuryUsd.set({ agentId: agent.id }, treasuryUsd);
			agentDailyBurnUsd.set({ agentId: agent.id }, dailyBurnUsd);
			agentRunwayDays.set({ agentId: agent.id }, runwayDays);
			updated += 1;
		}

		context.logger.info({ jobId: job.id, reason: payload.reason, updated }, "agent metrics rollup completed");

		return { status: "completed", updated, reason: payload.reason };
	};
}

async function readInferenceSpendUsd(context: WorkerContext, agentId: string, since: Date): Promise<number> {
	const rows = await context.db
		.select({ data: agentEvents.data })
		.from(agentEvents)
		.where(
			and(
				eq(agentEvents.agentId, agentId),
				eq(agentEvents.eventType, "inference.spent"),
				gte(agentEvents.createdAt, since),
			),
		);

	return rows.reduce((total, row) => total + inferenceUsdFromData(row.data), 0);
}

function inferenceUsdFromData(data: Record<string, unknown>): number {
	const usd = numericField(data, "usd") ?? numericField(data, "costUsd") ?? numericField(data, "amountUsd");
	if (usd !== null) return usd;

	const cents = numericField(data, "cents") ?? numericField(data, "costCents") ?? numericField(data, "amountCents");
	return cents === null ? 0 : cents / 100;
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

function parseUsd(raw: string | null): number | null {
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}
