import { schema } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { sql } from "drizzle-orm";

import { addressForPrivateKey, encryptBundleWalletPk, normalizeAddress } from "../bundle-wallet-pool.js";

export async function seedBundleWalletPool(db: Database, privateKeys: string[]): Promise<string[]> {
	const rows = privateKeys.map((pk) => {
		const address = normalizeAddress(addressForPrivateKey(pk));
		return {
			address,
			encryptedPk: encryptBundleWalletPk(pk),
			isActive: true,
			balanceBnb: "0",
			notes: "dev seed",
			updatedAt: new Date(),
		};
	});
	if (rows.length === 0) return [];
	await db
		.insert(schema.bundleWalletPool)
		.values(rows)
		.onConflictDoUpdate({
			target: schema.bundleWalletPool.address,
			set: {
				encryptedPk: sql`excluded.encrypted_pk`,
				isActive: true,
				notes: "dev seed",
				updatedAt: new Date(),
			},
		});
	return rows.map((row) => row.address);
}
