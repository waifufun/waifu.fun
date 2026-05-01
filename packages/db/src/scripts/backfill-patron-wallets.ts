/**
 * Idempotent W9.4 backfill helper for patron_wallets.
 *
 * Calling convention:
 *   DATABASE_URL=postgres://... bun run --filter @waifufun/db db:backfill-patron-wallets
 *
 * The migration intentionally does not run this script automatically. It is safe to run
 * multiple times: existing patron_wallets rows are skipped via ON CONFLICT DO NOTHING.
 *
 * Algorithm:
 * 1. SELECT DISTINCT owner_address FROM agent_personas WHERE owner_address IS NOT NULL.
 * 2. Match each address to creators.evm_address, then use creators.steward_user_id.
 * 3. Find a patron_users row with that steward_user_id; if absent, skip until Steward sign-in binds it.
 * 4. Insert patron_wallets(patron_id, lower(address)) with conflict handling.
 */
import { eq, sql } from "drizzle-orm";

import { createDatabase } from "../client.js";
import { agentPersonas } from "../schema/agent-personas.js";
import { creators } from "../schema/creators.js";
import { patronUsers } from "../schema/patron-users.js";
import { patronWallets } from "../schema/patron-wallets.js";

const normalizeAddress = (address: string) => address.toLowerCase();

async function main() {
	const { client, db } = createDatabase();

	try {
		const ownerRows = await db
			.selectDistinct({ address: agentPersonas.ownerAddress })
			.from(agentPersonas)
			.where(sql`${agentPersonas.ownerAddress} IS NOT NULL`);

		let processed = 0;
		let inserted = 0;
		let skipped = 0;

		for (const row of ownerRows) {
			if (!row.address) continue;
			processed += 1;
			const address = normalizeAddress(row.address);

			const [creator] = await db
				.select({ stewardUserId: creators.stewardUserId })
				.from(creators)
				.where(sql`lower(${creators.evmAddress}) = ${address}`)
				.limit(1);

			if (!creator?.stewardUserId) {
				skipped += 1;
				continue;
			}

			const [patron] = await db
				.select({ id: patronUsers.id })
				.from(patronUsers)
				.where(eq(patronUsers.stewardUserId, creator.stewardUserId))
				.limit(1);

			if (!patron) {
				skipped += 1;
				continue;
			}

			const rows = await db
				.insert(patronWallets)
				.values({ patronId: patron.id, address })
				.onConflictDoNothing()
				.returning({ id: patronWallets.id });

			if (rows.length > 0) inserted += 1;
		}

		console.log(
			`${processed} addresses processed, ${inserted} patron_wallets inserted, ${skipped} skipped (no Steward bound yet)`,
		);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
