import {
	type AgentEventRow,
	type AgentPersonaRow,
	agentEventQueries,
	agentPersonaQueries,
	getDatabase,
} from "@waifufun/db";

import { type HandlerContext, resolveHandler } from "./handlers/index.js";
import { logger } from "./lib/logger.js";
import { createTwitterClientFromEnv } from "./twitter/client.js";

export interface WorkerOpts {
	/** Poll interval (ms) when queue is empty or after a full batch. */
	intervalMs?: number;
	/** Max events claimed per dequeue. */
	batchSize?: number;
	/** Per-agent rate limit window (ms). Default 5 min. */
	rateLimitMs?: number;
}

/**
 * In-memory per-agent last-tweet timestamps. Naive but fine for v1: if the
 * worker restarts we re-tweet — the cost is at most one duplicate per agent
 * per restart, and the DB-side queue processing is idempotent otherwise.
 * A persistent rate limit (redis/table) can come with multi-worker HA.
 */
const lastTweetAt = new Map<string, number>();

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_RATE_LIMIT_MS = 5 * 60 * 1000;

export async function runWorker(opts: WorkerOpts = {}): Promise<void> {
	const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
	const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
	const rateLimitMs = opts.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;

	const { db } = getDatabase();
	const twitter = createTwitterClientFromEnv(logger);
	const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

	if (!anthropicApiKey) {
		logger.warn("ANTHROPIC_API_KEY not set — handlers will use template fallbacks");
	}

	const ctx: HandlerContext = {
		logger,
		twitter,
		anthropicApiKey,
	};

	let stopping = false;
	const stop = () => {
		stopping = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => {
			logger.info({ signal }, "brain: shutdown signal received");
			stop();
		});
	}

	logger.info(
		{
			intervalMs,
			batchSize,
			rateLimitMs,
			dryRun: twitter.dryRun,
			anthropic: !!anthropicApiKey,
		},
		"brain: worker starting",
	);

	while (!stopping) {
		try {
			const claimed = await agentEventQueries.dequeueNext(db, { limit: batchSize });

			if (claimed.length === 0) {
				await sleep(intervalMs);
				continue;
			}

			logger.debug({ count: claimed.length }, "brain: claimed events");

			for (const event of claimed) {
				if (stopping) break;
				await processEvent(db, event, ctx, rateLimitMs);
			}

			// If we got a full batch, loop immediately — there may be more.
			if (claimed.length < batchSize) {
				await sleep(intervalMs);
			}
		} catch (err) {
			logger.error({ err }, "brain: dequeue loop error");
			await sleep(intervalMs);
		}
	}

	logger.info("brain: worker stopped");
}

async function processEvent(
	db: ReturnType<typeof getDatabase>["db"],
	event: AgentEventRow,
	ctx: HandlerContext,
	rateLimitMs: number,
): Promise<void> {
	const handler = resolveHandler(event.type);
	if (!handler) {
		ctx.logger.warn({ eventId: event.id, type: event.type }, "brain: no handler for event type");
		await agentEventQueries.markFailed(db, event.id, `no handler for type ${event.type}`);
		return;
	}

	let persona: AgentPersonaRow | null = null;
	try {
		persona = await lookupPersona(db, event);
	} catch (err) {
		ctx.logger.error({ err, eventId: event.id }, "brain: persona lookup threw");
		await agentEventQueries.markFailed(db, event.id, `persona lookup error: ${errMsg(err)}`);
		return;
	}

	if (!persona) {
		ctx.logger.debug(
			{
				eventId: event.id,
				type: event.type,
				tokenAddress: event.tokenAddress,
				agentId: event.agentId,
			},
			"brain: no persona for event (orphan token) — marking failed",
		);
		await agentEventQueries.markFailed(db, event.id, "no persona for token/agent");
		return;
	}

	// Rate-limit: max 1 tweet per agent per window.
	const now = Date.now();
	const last = lastTweetAt.get(persona.agentId) ?? 0;
	if (now - last < rateLimitMs) {
		const waitMs = rateLimitMs - (now - last);
		ctx.logger.info(
			{ agentId: persona.agentId, eventId: event.id, type: event.type, waitMs },
			"brain: rate-limited, skipping event",
		);
		await agentEventQueries.markFailed(db, event.id, `rate-limited (cooldown ${Math.ceil(waitMs / 1000)}s)`);
		return;
	}

	try {
		const result = await handler({ event, persona, ctx });
		if (result.ok) {
			lastTweetAt.set(persona.agentId, Date.now());
			await agentEventQueries.markDone(db, event.id);
			ctx.logger.info(
				{
					eventId: event.id,
					type: event.type,
					agentId: persona.agentId,
					tweet: result.tweet,
					dryRun: ctx.twitter.dryRun,
				},
				"brain: event handled",
			);
		} else {
			await agentEventQueries.markFailed(db, event.id, result.errorMessage ?? "handler returned ok=false");
			ctx.logger.warn({ eventId: event.id, type: event.type, error: result.errorMessage }, "brain: handler failed");
		}
	} catch (err) {
		ctx.logger.error({ err, eventId: event.id, type: event.type, agentId: persona.agentId }, "brain: handler threw");
		await agentEventQueries.markFailed(db, event.id, `handler threw: ${errMsg(err)}`);
	}
}

/**
 * Resolve the persona for an event. Prefer `agentId` (set when the
 * orchestrator already hydrated the event), fall back to `tokenAddress`.
 */
async function lookupPersona(
	db: ReturnType<typeof getDatabase>["db"],
	event: AgentEventRow,
): Promise<AgentPersonaRow | null> {
	if (event.agentId) {
		const row = await agentPersonaQueries.getAgentPersonaByAgentId(db, event.agentId);
		if (row) return row;
	}
	if (event.tokenAddress) {
		const row = await agentPersonaQueries.getAgentPersonaByTokenAddress(db, event.tokenAddress);
		if (row) return row;
	}
	return null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
