import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import * as jose from "jose";

import { agentPersonaQueries, agentSafes } from "@waifufun/db";
import { type AgentProvisioningJob, parseJobPayload } from "@waifufun/queue";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext, WorkerProcessor } from "../lib/types.js";

interface ElizaCreateResult {
	agentId: string;
	agentName: string;
	jobId: string;
	status: string;
	nodeId: string;
	message: string;
}

export function createAgentProvisioningProcessor(context: WorkerContext): WorkerProcessor {
	return async (job: Job) => {
		const payload = parseJobPayload("agent-provisioning", job.data) as AgentProvisioningJob;

		try {
			const result = await provision(context, payload);
			await emitAgentEvent({
				db: context.db,
				agentId: payload.agentId,
				eventType: "agent.provisioned",
				data: {
					containerId: result.agentId,
					jobId: result.jobId,
					status: result.status,
					nodeId: result.nodeId,
					retryJobId: job.id ?? null,
				},
			});
			return result;
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			if ((job.attemptsMade ?? 0) >= 2) {
				await emitAgentEvent({
					db: context.db,
					agentId: payload.agentId,
					eventType: "agent.provisioning_dead_letter",
					data: { error, attempts: (job.attemptsMade ?? 0) + 1, retryJobId: job.id ?? null },
				});
			}
			throw err;
		}
	};
}

async function provision(context: WorkerContext, payload: AgentProvisioningJob): Promise<ElizaCreateResult> {
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(context.db, payload.agentId);
	if (!persona) throw new Error(`agent persona not found for ${payload.agentId}`);

	const [safe] = await context.db
		.select({ safeAddress: agentSafes.safeAddress })
		.from(agentSafes)
		.where(eq(agentSafes.agentId, persona.id))
		.limit(1);

	const body = {
		agentName: persona.name || payload.agentId,
		agentConfig: {
			personaId: payload.agentId,
			xHandle:
				stringField(payload.data, "xHandle") ??
				stringField(payload.data, "claimedByXHandle") ??
				persona.claimedByXHandle ??
				persona.twitterHandle ??
				null,
			taxConfig: payload.data.taxConfig ?? persona.taxConfig ?? null,
			safeAddress: stringField(payload.data, "safeAddress") ?? safe?.safeAddress ?? null,
		},
	};

	const baseUrl = (process.env.ELIZA_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
	const jwtSecret = process.env.ELIZA_JWT_SECRET;
	if (!jwtSecret) throw new Error("ELIZA_JWT_SECRET env var is required for the agent bridge");
	const token = await new jose.SignJWT({
		userId: payload.agentId,
		email: `${payload.agentId}@waifu.fun`,
		tier: "user",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(jwtSecret));

	const response = await fetch(`${baseUrl}/api/agents`, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`eliza-cloud POST /api/agents: ${response.status} ${text}`);
	}
	const json = (await response.json()) as {
		success?: boolean;
		data?: ElizaCreateResult;
		error?: string;
	};
	if (json.success === false) throw new Error(json.error ?? "Unknown eliza-cloud error");
	if (!json.data) throw new Error("eliza-cloud createAgent returned no data");
	return json.data;
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}
