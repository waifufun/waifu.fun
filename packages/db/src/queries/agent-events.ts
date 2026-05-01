import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import {
	type AgentEventRow,
	type AgentEventType,
	type NewAgentEvent,
	agentEvents,
	canonicalAgentEventType,
} from "../schema/agent-events.js";

export type { AgentEventRow, AgentEventType, NewAgentEvent };

export interface EnqueueAgentEventInput {
	agentId?: string | null;
	tokenAddress?: string | null;
	type: AgentEventType | string;
	payload: Record<string, unknown>;
}

/**
 * Insert a new pending event into the queue. Caller should treat this as
 * best-effort: indexer handlers log + swallow failures so the main DB
 * writes stay the source of truth.
 */
export async function enqueueAgentEvent(db: Database, input: EnqueueAgentEventInput): Promise<AgentEventRow> {
	const eventType = canonicalAgentEventType(input.type);
	const values: NewAgentEvent = {
		agentId: input.agentId ?? null,
		eventType,
		data: input.payload,
		txHash: typeof input.payload.txHash === "string" ? input.payload.txHash : null,
		blockNumber: typeof input.payload.blockNumber === "string" ? input.payload.blockNumber : null,
		chainId: typeof input.payload.chainId === "string" ? input.payload.chainId : null,
		tokenAddress: input.tokenAddress ? input.tokenAddress.toLowerCase() : null,
		type: input.type,
		payload: input.payload,
	};

	const [row] = await db.insert(agentEvents).values(values).returning();
	if (!row) {
		throw new Error("enqueueAgentEvent: insert returned no row");
	}
	return row;
}

export interface DequeueOpts {
	limit?: number;
}

/**
 * Claim up to `limit` pending events. Atomically flips `status` to
 * `processing`, bumps `attempts`, and returns the claimed rows. Uses
 * `FOR UPDATE SKIP LOCKED` so multiple workers can run in parallel
 * without double-processing.
 */
export async function dequeueNext(db: Database, opts: DequeueOpts = {}): Promise<AgentEventRow[]> {
	const limit = Math.max(1, Math.min(opts.limit ?? 10, 100));

	const rows = await db.execute<{
		id: string;
		agent_id: string | null;
		event_type: AgentEventType;
		data: unknown;
		tx_hash: string | null;
		block_number: string | null;
		chain_id: string | null;
		token_address: string | null;
		type: string;
		payload: unknown;
		status: string;
		attempts: number;
		error_message: string | null;
		created_at: Date | string;
		processed_at: Date | string | null;
	}>(sql`
    WITH claimed AS (
      SELECT id
      FROM ${agentEvents}
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${agentEvents} AS e
    SET status = 'processing',
        attempts = e.attempts + 1
    FROM claimed
    WHERE e.id = claimed.id
    RETURNING e.*
  `);

	return rows.map((r) => ({
		id: r.id,
		agentId: r.agent_id,
		eventType: r.event_type,
		data: r.data as Record<string, unknown>,
		txHash: r.tx_hash,
		blockNumber: r.block_number,
		chainId: r.chain_id,
		tokenAddress: r.token_address,
		type: r.type,
		payload: r.payload as Record<string, unknown>,
		status: r.status,
		attempts: r.attempts,
		errorMessage: r.error_message,
		createdAt: typeof r.created_at === "string" ? new Date(r.created_at) : r.created_at,
		processedAt:
			r.processed_at == null ? null : typeof r.processed_at === "string" ? new Date(r.processed_at) : r.processed_at,
	})) as AgentEventRow[];
}

/**
 * Mark a claimed event as successfully handled.
 */
export async function markDone(db: Database, id: string): Promise<AgentEventRow | null> {
	const [row] = await db
		.update(agentEvents)
		.set({
			status: "done",
			errorMessage: null,
			processedAt: new Date(),
		})
		.where(eq(agentEvents.id, id))
		.returning();
	return row ?? null;
}

/**
 * Mark a claimed event as failed. Stores the error message and stamps
 * `processed_at`. Retry policy (requeue vs. permanent-fail) is up to the
 * caller — for v1 we just set `failed` and leave it; ops can flip status
 * back to `pending` manually if they want to retry.
 */
export async function markFailed(db: Database, id: string, errorMessage: string): Promise<AgentEventRow | null> {
	const [row] = await db
		.update(agentEvents)
		.set({
			status: "failed",
			errorMessage: errorMessage.slice(0, 4000),
			processedAt: new Date(),
		})
		.where(eq(agentEvents.id, id))
		.returning();
	return row ?? null;
}

/**
 * Return the most recent events for a given token address, newest first.
 * Used by the brain worker / admin UI to reconstruct an agent's story.
 */
export async function listRecentForToken(db: Database, tokenAddress: string, limit = 20): Promise<AgentEventRow[]> {
	return db
		.select()
		.from(agentEvents)
		.where(eq(agentEvents.tokenAddress, tokenAddress.toLowerCase()))
		.orderBy(desc(agentEvents.createdAt))
		.limit(Math.max(1, Math.min(limit, 500)));
}

/**
 * Return the most recent events across an agent, by `agentId` — useful if
 * the token address isn't known yet but the agent slug is.
 */
export async function listRecentForAgent(db: Database, agentId: string, limit = 20): Promise<AgentEventRow[]> {
	return db
		.select()
		.from(agentEvents)
		.where(eq(agentEvents.agentId, agentId))
		.orderBy(desc(agentEvents.createdAt))
		.limit(Math.max(1, Math.min(limit, 500)));
}

/**
 * Reset a stuck event back to `pending` (e.g. worker died mid-process).
 * Returns the row or null if id not found / not in `processing` state.
 */
export async function requeueStuck(db: Database, id: string): Promise<AgentEventRow | null> {
	const [row] = await db
		.update(agentEvents)
		.set({ status: "pending", errorMessage: null })
		.where(and(eq(agentEvents.id, id), eq(agentEvents.status, "processing")))
		.returning();
	return row ?? null;
}
