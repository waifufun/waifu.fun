import { type Database, getDatabase, schema } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import { eq } from "drizzle-orm";

const LOW_BALANCE_BNB = 0.3;

export async function checkBundleWalletFunding(
	db: Database,
	logger: Pick<Logger, "info" | "warn"> = console,
	thresholdBnb = LOW_BALANCE_BNB,
): Promise<{ checked: number; low: number }> {
	const rows = await db
		.select({ address: schema.bundleWalletPool.address, balanceBnb: schema.bundleWalletPool.balanceBnb })
		.from(schema.bundleWalletPool)
		.where(eq(schema.bundleWalletPool.isActive, true));

	let low = 0;
	for (const row of rows) {
		const balanceBnb = Number(row.balanceBnb ?? 0);
		if (balanceBnb < thresholdBnb) {
			low += 1;
			logger.warn({ address: row.address, balanceBnb, thresholdBnb }, "bundle wallet below funding threshold");
		}
	}
	logger.info({ checked: rows.length, low, thresholdBnb }, "bundle wallet funding check complete, auto-fund disabled");
	return { checked: rows.length, low };
}

export async function runWalletPoolFundingCheck(): Promise<void> {
	const db = getDatabase().db;
	await checkBundleWalletFunding(db);
}

if (process.env.WALLET_POOL_FUND_RUN_ONCE === "1") {
	void runWalletPoolFundingCheck().catch((error: unknown) => {
		console.error("wallet pool funding check failed", error);
		process.exit(1);
	});
}
