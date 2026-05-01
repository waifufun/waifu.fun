import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import {
	type LaunchpadWaitlistRow,
	type NewLaunchpadWaitlist,
	launchpadWaitlist,
} from "../schema/launchpad-waitlist.js";

export type { LaunchpadWaitlistRow, NewLaunchpadWaitlist };

export async function addToWaitlist(
	db: Database,
	data: Pick<NewLaunchpadWaitlist, "email" | "launchpadId">,
): Promise<LaunchpadWaitlistRow> {
	const normalized = { email: data.email.trim().toLowerCase(), launchpadId: data.launchpadId };
	const [inserted] = await db
		.insert(launchpadWaitlist)
		.values(normalized)
		.onConflictDoNothing({ target: [launchpadWaitlist.email, launchpadWaitlist.launchpadId] })
		.returning();
	if (inserted) return inserted;

	const [existing] = await db
		.select()
		.from(launchpadWaitlist)
		.where(
			and(eq(launchpadWaitlist.email, normalized.email), eq(launchpadWaitlist.launchpadId, normalized.launchpadId)),
		)
		.limit(1);
	if (!existing) throw new Error("addToWaitlist: conflict row not found");
	return existing;
}

export async function getWaitlistCount(db: Database, launchpadId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(launchpadWaitlist)
		.where(eq(launchpadWaitlist.launchpadId, launchpadId));
	return row?.count ?? 0;
}
