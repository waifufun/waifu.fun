import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { createDatabase, schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const addressA = "0x00000000000000000000000000000000000000a1";
const addressB = "0x00000000000000000000000000000000000000b2";

if (!databaseUrl) {
	test("patron_wallets schema tests", { skip: "Set TEST_DATABASE_URL or DATABASE_URL to run" }, () => {});
} else {
	const { db, client } = createDatabase(databaseUrl, { max: 1, onnotice: () => {} });

	async function resetDb() {
		await db.execute(
			"TRUNCATE TABLE patron_wallets, patron_sessions, patron_users, agent_personas RESTART IDENTITY CASCADE",
		);
	}

	after(async () => client.end());

	async function createPatron(suffix: string, stewardUserId = `steward-${suffix}`) {
		const [patron] = await db
			.insert(schema.patronUsers)
			.values({
				xUserId: `x-${suffix}`,
				xHandle: `handle_${suffix}`,
				stewardUserId,
				primaryEmail: `${suffix}@example.test`,
			})
			.returning();

		assert.ok(patron);
		return patron;
	}

	beforeEach(resetDb);

	test("patron_wallets row creation succeeds", async () => {
		const patron = await createPatron("create");
		const [wallet] = await db
			.insert(schema.patronWallets)
			.values({ patronId: patron.id, address: addressA })
			.returning();

		assert.ok(wallet);
		assert.equal(wallet.patronId, patron.id);
		assert.equal(wallet.address, addressA);
		assert.equal(wallet.chainId, 56);
		assert.equal(wallet.isPrimary, false);
	});

	test("duplicate (patron_id, address) violates uniqueness", async () => {
		const patron = await createPatron("dupe-patron");
		await db.insert(schema.patronWallets).values({ patronId: patron.id, address: addressA });

		await assert.rejects(
			() => db.insert(schema.patronWallets).values({ patronId: patron.id, address: addressA }),
			/unique|duplicate/i,
		);
	});

	test("duplicate address across patrons violates global address uniqueness", async () => {
		const patronOne = await createPatron("dupe-address-1");
		const patronTwo = await createPatron("dupe-address-2");
		await db.insert(schema.patronWallets).values({ patronId: patronOne.id, address: addressA });

		await assert.rejects(
			() => db.insert(schema.patronWallets).values({ patronId: patronTwo.id, address: addressA }),
			/unique|duplicate/i,
		);
	});

	test("deleting a patron cascades to wallets", async () => {
		const patron = await createPatron("cascade");
		await db.insert(schema.patronWallets).values({ patronId: patron.id, address: addressA });

		await db.delete(schema.patronUsers).where(eq(schema.patronUsers.id, patron.id));

		const wallets = await db.select().from(schema.patronWallets).where(eq(schema.patronWallets.patronId, patron.id));

		assert.equal(wallets.length, 0);
	});

	test("agent_personas.owner_steward_user_id can be set and queried", async () => {
		await db.insert(schema.agentPersonas).values({
			agentId: "waifu-w9-4-owner-index",
			name: "W9.4 Owner Index",
			ownerAddress: addressB,
			ownerStewardUserId: "steward-agent-owner",
		});

		const rows = await db
			.select({ agentId: schema.agentPersonas.agentId })
			.from(schema.agentPersonas)
			.where(eq(schema.agentPersonas.ownerStewardUserId, "steward-agent-owner"));

		assert.deepEqual(rows, [{ agentId: "waifu-w9-4-owner-index" }]);
	});
}
