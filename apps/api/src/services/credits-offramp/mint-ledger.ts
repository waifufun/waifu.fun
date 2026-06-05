/**
 * Persistence helpers for the autonomous off-ramp audit/idempotency ledger
 * (`credit_offramp_mints`). Thin wrappers over Drizzle so the orchestrator and
 * tests share one shape.
 *
 *  - `sumSpentTodayUsd`  -> daily-cap accounting (sum of credited+pending USD in
 *                           the current UTC day).
 *  - `hasDeposit`        -> fast idempotency precheck (the DB unique index is the
 *                           hard guarantee; this just avoids a wasted convert).
 *  - `recordMint`        -> idempotent insert (ON CONFLICT DO NOTHING on the
 *                           deposit tx hash). Returns whether a row was created.
 *  - `markCredited` / `markFailed` -> terminal status updates after convert.
 */

import { schema } from "@waifufun/db";
import type { CreditOfframpMintStatus, NewCreditOfframpMint } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

const { creditOfframpMints } = schema;

/** Start of the current UTC day as a Date (for the daily-cap window). */
export function startOfUtcDay(now: Date = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/** Sum USD auto-minted (credited or still-pending) in the current UTC day. */
export async function sumSpentTodayUsd(db: Database, now: Date = new Date()): Promise<number> {
	const dayStart = startOfUtcDay(now);
	const rows = await db
		.select({ total: sql<string>`COALESCE(SUM(${creditOfframpMints.usdAmount}), 0)` })
		.from(creditOfframpMints)
		.where(
			and(gte(creditOfframpMints.createdAt, dayStart), inArray(creditOfframpMints.status, ["credited", "pending"])),
		);
	const total = Number(rows[0]?.total ?? 0);
	return Number.isFinite(total) ? total : 0;
}

/**
 * True if this deposit already has an IN-FLIGHT (pending) or SUCCESSFUL
 * (credited) mint row — the only states that should block re-processing. Refusal
 * / failure rows (capped/killed/skipped/failed) are deliberately NOT blocking so
 * a kill-switched, transiently-skipped, or failed deposit can be retried on a
 * later tick. Mirrors the partial unique index.
 */
export async function hasActiveDeposit(db: Database, depositTxHash: string): Promise<boolean> {
	const rows = await db
		.select({ id: creditOfframpMints.id })
		.from(creditOfframpMints)
		.where(
			and(
				eq(creditOfframpMints.depositTxHash, depositTxHash.toLowerCase()),
				inArray(creditOfframpMints.status, ["pending", "credited"]),
			),
		)
		.limit(1);
	return rows.length > 0;
}

export interface RecordMintInput {
	depositTxHash: string;
	agentTokenAddress?: string | null;
	safeAddress?: string | null;
	depositBnb?: number | null;
	convertBnb?: number | null;
	usdAmount: number;
	bnbPriceUsd?: number | null;
	status: CreditOfframpMintStatus;
	reason?: string | null;
}

function toValues(input: RecordMintInput): NewCreditOfframpMint {
	return {
		depositTxHash: input.depositTxHash.toLowerCase(),
		agentTokenAddress: input.agentTokenAddress?.toLowerCase() ?? null,
		safeAddress: input.safeAddress?.toLowerCase() ?? null,
		depositBnb: input.depositBnb != null ? String(input.depositBnb) : null,
		convertBnb: input.convertBnb != null ? String(input.convertBnb) : null,
		usdAmount: String(input.usdAmount),
		bnbPriceUsd: input.bnbPriceUsd != null ? String(input.bnbPriceUsd) : null,
		status: input.status,
		reason: input.reason ?? null,
	};
}

/**
 * Claim a deposit for minting by inserting a `pending` row. The PARTIAL unique
 * index (status IN pending/credited) + ON CONFLICT DO NOTHING guarantees only
 * ONE in-flight/successful mint per deposit, even under concurrent ticks, while
 * still allowing prior refusal/failure rows for the same deposit to coexist.
 * Returns the row id, or null when another tick already holds the active claim.
 */
export async function claimPendingMint(db: Database, input: RecordMintInput): Promise<string | null> {
	const inserted = await db
		.insert(creditOfframpMints)
		.values({ ...toValues(input), status: "pending" })
		.onConflictDoNothing({
			target: creditOfframpMints.depositTxHash,
			// Matches the PARTIAL unique index predicate so the conflict arbiter is the
			// active-deposit index (pending/credited), not the whole-column.
			where: inArray(creditOfframpMints.status, ["pending", "credited"]),
		})
		.returning({ id: creditOfframpMints.id });
	return inserted[0]?.id ?? null;
}

/**
 * Append a non-blocking audit row for a refusal/failure decision
 * (capped/killed/skipped/failed). These do NOT claim the active-mint slot, so
 * the deposit remains eligible for a future retry.
 */
export async function recordAudit(db: Database, input: RecordMintInput): Promise<void> {
	await db.insert(creditOfframpMints).values(toValues(input));
}

/** Mark a pending mint as credited with the confirm receipt + resulting balance. */
export async function markCredited(
	db: Database,
	id: string,
	receipt: {
		offrampTxHash?: string | null;
		elizaPaymentId?: string | null;
		creditsAdded?: string | null;
		resultingBalance?: string | null;
	},
): Promise<void> {
	await db
		.update(creditOfframpMints)
		.set({
			status: "credited",
			offrampTxHash: receipt.offrampTxHash ?? null,
			elizaPaymentId: receipt.elizaPaymentId ?? null,
			creditsAdded: receipt.creditsAdded ?? null,
			resultingBalance: receipt.resultingBalance ?? null,
			confirmedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(creditOfframpMints.id, id));
}

/** Mark a pending mint as failed (retryable) with a reason. */
export async function markFailed(db: Database, id: string, reason: string): Promise<void> {
	await db
		.update(creditOfframpMints)
		.set({ status: "failed", reason, updatedAt: new Date() })
		.where(eq(creditOfframpMints.id, id));
}

/**
 * Demote a pending row to `capped` (e.g. when a post-claim daily-cap recheck
 * shows a concurrent tick consumed the headroom first). `capped` is outside the
 * partial unique index, so this RELEASES the active-mint slot and leaves the
 * deposit eligible for a future retry once headroom frees up.
 */
export async function markCapped(db: Database, id: string, reason: string): Promise<void> {
	await db
		.update(creditOfframpMints)
		.set({ status: "capped", reason, updatedAt: new Date() })
		.where(eq(creditOfframpMints.id, id));
}
