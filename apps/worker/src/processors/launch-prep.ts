import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { encodeFunctionData } from "viem";

import { type LaunchStatus, agentPersonas, launches } from "@waifufun/db";
import { TokenManager2Abi } from "@waifufun/fourmeme";
import { type LaunchPrepJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext } from "../lib/types.js";

type PreparedLaunchRow = {
	id: string;
	agentId: string | null;
	status: LaunchStatus;
	firstBuyWei: string;
	txHash: string | null;
	creatorAddress: string | null;
	taxRecipientAddress: string | null;
	prelaunchCreateArg: string | null;
	prelaunchSignature: string | null;
};

type LaunchBroadcastResult = { txHash: `0x${string}` };

type LaunchBroadcaster = (input: {
	agentId: string;
	createArg: `0x${string}`;
	signature: `0x${string}`;
	firstBuyWei: string;
	chainId: number;
}) => Promise<LaunchBroadcastResult>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function createLaunchPrepProcessor(context: WorkerContext) {
	return async (job: Job<LaunchPrepJob>) => {
		const payload = parseJobPayload("launch-prep", job.data);

		context.logger.info(
			{
				jobId: job.id,
				launchId: payload.launchId,
				chainId: payload.chainId,
			},
			"launch lifecycle processor starting",
		);

		const launch = await loadPreparedLaunch(context, payload.launchId);
		if (!launch) throw new Error(`launch-not-found: ${payload.launchId}`);

		if (launch.status !== "queued") {
			throw new Error(`launch-invalid-status: ${launch.status}`);
		}

		if (!launch.agentId) {
			await failLaunch(context, launch, "launch missing agent_id");
			throw new Error("launch missing agent_id");
		}
		if (!isHex(launch.prelaunchCreateArg) || !isHex(launch.prelaunchSignature)) {
			await failLaunch(context, launch, "launch missing prepared four.meme args");
			throw new Error("launch missing prepared four.meme args");
		}

		try {
			const broadcaster = context.launchBroadcaster ?? createStewardLaunchBroadcaster();
			const result = await broadcaster({
				agentId: launch.agentId,
				createArg: launch.prelaunchCreateArg,
				signature: launch.prelaunchSignature,
				firstBuyWei: launch.firstBuyWei,
				chainId: payload.chainId,
			});

			await context.db
				.update(launches)
				.set({
					status: "launching",
					txHash: result.txHash,
					submittedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(and(eq(launches.id, launch.id), eq(launches.status, "queued")));

			await emitAgentEvent({
				eventType: "launch.submitted",
				agentId: launch.agentId,
				data: { launchId: launch.id, txHash: result.txHash },
				db: context.db,
			});

			return { status: "submitted", launchId: launch.id, txHash: result.txHash };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			await failLaunch(context, launch, reason);
			throw error;
		}
	};
}

async function loadPreparedLaunch(context: WorkerContext, launchId: string): Promise<PreparedLaunchRow | null> {
	const [row] = await context.db
		.select({
			id: launches.id,
			agentId: launches.agentId,
			status: launches.status,
			firstBuyWei: launches.firstBuyWei,
			txHash: launches.txHash,
			creatorAddress: launches.creatorAddress,
			taxRecipientAddress: launches.taxRecipientAddress,
			prelaunchCreateArg: agentPersonas.prelaunchCreateArg,
			prelaunchSignature: agentPersonas.prelaunchSignature,
		})
		.from(launches)
		.leftJoin(agentPersonas, eq(launches.agentId, agentPersonas.agentId))
		.where(eq(launches.id, launchId))
		.limit(1);

	return row ?? null;
}

async function failLaunch(context: WorkerContext, launch: PreparedLaunchRow, reason: string): Promise<void> {
	await context.db
		.update(launches)
		.set({ status: "failed", failureReason: reason, updatedAt: new Date() })
		.where(eq(launches.id, launch.id));

	if (launch.agentId) {
		await emitAgentEvent({
			eventType: "launch.failed",
			agentId: launch.agentId,
			data: { launchId: launch.id, error: reason },
			db: context.db,
		});
	}
}

function createStewardLaunchBroadcaster(): LaunchBroadcaster {
	const baseUrl = process.env.STEWARD_API_URL?.replace(/\/+$/, "");
	const apiKey = process.env.STEWARD_API_KEY;
	const tokenManager2 = (process.env.FOURMEME_TOKEN_MANAGER_2 ?? ZERO_ADDRESS) as `0x${string}`;
	if (!baseUrl || !apiKey) {
		throw new Error("STEWARD_API_URL and STEWARD_API_KEY env vars required");
	}

	return async ({ agentId, createArg, signature, firstBuyWei, chainId }) => {
		const data = encodeFunctionData({
			abi: TokenManager2Abi as unknown as readonly unknown[],
			functionName: "createToken",
			args: [createArg, signature],
		});

		const response = await fetch(`${baseUrl}/vault/${encodeURIComponent(agentId)}/sign`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				to: tokenManager2,
				data,
				value: firstBuyWei,
				chainId,
				broadcast: true,
			}),
		});

		const body = (await response.json().catch(() => ({}))) as { txHash?: string; status?: string };
		if (!response.ok) {
			throw new Error(`steward broadcast failed (${response.status}): ${JSON.stringify(body)}`);
		}
		if (body.status === "pending_approval") {
			throw new Error("Steward returned pending_approval for launch broadcast");
		}
		if (!isHex(body.txHash)) {
			throw new Error("Steward did not return txHash for launch broadcast");
		}
		return { txHash: body.txHash };
	};
}

function isHex(value: unknown): value is `0x${string}` {
	return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}
