import { sql } from "drizzle-orm";

import type { Database } from "../client.js";

export async function ping(db: Database): Promise<boolean> {
	try {
		await db.execute(sql`SELECT 1`);
		return true;
	} catch {
		return false;
	}
}

export interface HealthCheckResult {
	ok: boolean;
	provider: string;
	notes?: string[];
}

export async function health(db: Database): Promise<HealthCheckResult> {
	const isOk = await ping(db);
	return {
		ok: isOk,
		provider: "drizzle-postgres",
		notes: isOk ? undefined : ["Database connection failed"],
	};
}
