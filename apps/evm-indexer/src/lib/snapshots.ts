import { schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

import type { IndexerRuntime } from "./runtime.js";

const DEFAULT_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1_000;
const DEFAULT_PERIOD_SECONDS = 5 * 60;

export async function writeActiveTokenSnapshots(runtime: IndexerRuntime, snapshotAt = new Date()): Promise<number> {
	const activeTokens = await runtime.db
		.select({
			chainId: schema.tokens.chainId,
			tokenAddress: schema.tokens.contractAddress,
			price: schema.tokens.currentPrice,
			marketCapUsd: schema.tokens.marketCapUsd,
			volumePeriod: schema.tokens.volume24h,
			holderCount: schema.tokens.holderCount,
			curveProgress: schema.tokens.curveProgress,
			reserveAmount: schema.tokens.reserveAmount,
		})
		.from(schema.tokens)
		.where(eq(schema.tokens.status, "active"));

	if (activeTokens.length === 0) return 0;

	await runtime.db.insert(schema.tokenSnapshots).values(
		activeTokens.map((token) => ({
			chainId: token.chainId,
			tokenAddress: token.tokenAddress,
			price: token.price,
			marketCapUsd: token.marketCapUsd,
			volumePeriod: token.volumePeriod,
			holderCount: token.holderCount,
			curveProgress: token.curveProgress,
			reserveAmount: token.reserveAmount,
			snapshotAt,
			periodSeconds: DEFAULT_PERIOD_SECONDS,
		})),
	);

	return activeTokens.length;
}

export function startTokenSnapshotCron(
	runtime: IndexerRuntime,
	intervalMs = Number(process.env.TOKEN_SNAPSHOT_INTERVAL_MS ?? DEFAULT_SNAPSHOT_INTERVAL_MS),
): () => void {
	if (process.env.TOKEN_SNAPSHOTS_ENABLED === "false") {
		runtime.logger.info("TOKEN_SNAPSHOTS_ENABLED=false, skipping token snapshot cron");
		return () => undefined;
	}

	let stopped = false;
	let timer: NodeJS.Timeout | null = null;

	const tick = async () => {
		if (stopped) return;

		try {
			const count = await writeActiveTokenSnapshots(runtime);
			runtime.logger.info({ count }, "token snapshots written");
		} catch (error) {
			runtime.logger.error({ error }, "token snapshot cron failed");
		} finally {
			if (!stopped) {
				timer = setTimeout(() => void tick(), intervalMs);
			}
		}
	};

	timer = setTimeout(() => void tick(), intervalMs);

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
