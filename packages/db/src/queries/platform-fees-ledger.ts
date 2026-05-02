import { eq, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import {
	type NewPlatformFeeLedger,
	type PlatformFeeLedgerRow,
	platformFeesLedger,
} from "../schema/platform-fees-ledger.js";

export type { NewPlatformFeeLedger, PlatformFeeLedgerRow };

export type InsertFeeRecordInput = Omit<NewPlatformFeeLedger, "id" | "recordedAt">;

export async function insertFeeRecord(db: Database, data: InsertFeeRecordInput): Promise<PlatformFeeLedgerRow> {
	const [row] = await db.insert(platformFeesLedger).values(data).returning();
	if (!row) throw new Error("insertFeeRecord: insert returned no row");
	return row;
}

export async function getFeesByAgent(db: Database, agentId: string): Promise<PlatformFeeLedgerRow[]> {
	return db
		.select()
		.from(platformFeesLedger)
		.where(eq(platformFeesLedger.agentId, agentId))
		.orderBy(platformFeesLedger.recordedAt);
}

export async function getTotalFeesAcrossPlatform(db: Database): Promise<string> {
	const [row] = await db
		.select({
			totalWei: sql<string>`coalesce(sum(${platformFeesLedger.amountWei}::numeric), 0)::text`,
		})
		.from(platformFeesLedger);
	return row?.totalWei ?? "0";
}
