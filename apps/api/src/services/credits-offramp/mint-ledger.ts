/**
 * Persistence helpers for the autonomous off-ramp audit/idempotency ledger
 * (`credit_offramp_mints`). Thin wrappers over Drizzle so the orchestrator and
 * tests share one shape.
 *
 *  - `sumSpentTodayUsd`  -> daily-cap accounting (sum of credited+pending+failed
 *                           USD in the current UTC day).
 *  - `hasActiveDeposit`  -> fast idempotency precheck (the DB unique index is the
 *                           hard guarantee; this just avoids a wasted convert).
 *  - `claimPendingMint`  -> idempotent insert (ON CONFLICT DO NOTHING on the
 *                           active deposit tx hash). Returns the claimed row id.
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

/** Sum USD already committed or ambiguously provider-attempted in the current UTC day. */
export async function sumSpentTodayUsd(db: Database, now: Date = new Date()): Promise<number> {
	const dayStart = startOfUtcDay(now);
	const rows = await db
		.select({ total: sql<string>`COALESCE(SUM(${creditOfframpMints.usdAmount}), 0)` })
		.from(creditOfframpMints)
		.where(
			and(
				gte(creditOfframpMints.createdAt, dayStart),
				inArray(creditOfframpMints.status, ["credited", "pending", "failed"]),
			),
		);
	const total = Number(rows[0]?.total ?? 0);
	return Number.isFinite(total) ? total : 0;
}

/**
 * True if this deposit already has an in-flight, successful, or ambiguous
 * provider-attempted mint row. Failed rows remain blocking because a failed local
 * confirm can still mean Eliza Cloud accepted the tx before the response was
 * lost. Pre-provider refusal rows (capped/killed/skipped) are deliberately NOT
 * blocking so a kill-switched, capped, or transiently-skipped deposit can be
 * retried later. Mirrors the partial unique index.
 */
export async function hasActiveDeposit(db: Database, depositTxHash: string): Promise<boolean> {
	const rows = await db
		.select({ id: creditOfframpMints.id })
		.from(creditOfframpMints)
		.where(
			and(
				eq(creditOfframpMints.depositTxHash, depositTxHash.toLowerCase()),
				inArray(creditOfframpMints.status, ["pending", "credited", "failed"]),
			),
		)
		.limit(1);
	return rows.length > 0;
}

export interface RecordMintInput {
	depositTxHash: string;
	agentTokenAddress?: string | null;
	safeAddress?: string | null;
	asset?: "BNB" | "USDT" | null;
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
		asset: input.asset ?? "BNB",
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
 * index (status IN pending/credited/failed) + ON CONFLICT DO NOTHING guarantees
 * only ONE provider-attempted mint per deposit, even under concurrent ticks,
 * while still allowing prior pre-provider refusal rows for the same deposit to
 * coexist.
 * Returns the row id, or null when another tick already holds the active claim.
 */
export async function claimPendingMint(db: Database, input: RecordMintInput): Promise<string | null> {
	const inserted = await db
		.insert(creditOfframpMints)
		.values({ ...toValues(input), status: "pending" })
		.onConflictDoNothing({
			target: creditOfframpMints.depositTxHash,
			// Matches the PARTIAL unique index predicate so the conflict arbiter is the
			// active-deposit index (pending/credited/failed), not the whole-column.
			where: inArray(creditOfframpMints.status, ["pending", "credited", "failed"]),
		})
		.returning({ id: creditOfframpMints.id });
	return inserted[0]?.id ?? null;
}

/**
 * Append a non-blocking audit row for a pre-provider refusal decision
 * (capped/killed/skipped). These do NOT claim the active-mint slot, so the
 * deposit remains eligible for a future retry.
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

/** Mark a pending mint as failed with a reason; failed rows keep the idempotency claim. */
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
