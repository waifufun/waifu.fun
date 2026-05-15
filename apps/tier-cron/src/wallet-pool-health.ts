/**
 * P2 followup from INDEXER_AUDIT.md: bundle-wallet-pool stuck-lock alert.
 *
 * The bundle-submitter reserves a wallet from `bundle_wallet_pool` by
 * bumping `next_available_ts` forward by `BUNDLE_WALLET_COOLDOWN_SECONDS`
 * (90s). On success it stays at +cooldown; on failure attempts the
 * cooldown isn't reset until `releaseWallet` is called. If that release
 * call is ever missed (process killed mid-bundle, etc) the wallet sits
 * unavailable forever.
 *
 * This check runs each poll round, looks for any wallet where
 * `next_available_ts > now + STUCK_MULTIPLIER * cooldown`, and warn-logs
 * + counter-bumps. Read-only; nothing tries to un-stick the wallet
 * automatically — ops needs to inspect why release didn't fire.
 */

import { type Database, getDatabase, schema } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";

import { logger as defaultLogger } from "./lib/logger.js";
import { bumpCounter } from "./lib/metrics.js";

/** must match `apps/api/src/services/bundle-wallet-pool.ts:BUNDLE_WALLET_COOLDOWN_SECONDS`. */
export const BUNDLE_WALLET_COOLDOWN_SECONDS = 90;
/** factor on cooldown beyond which a wallet is considered stuck. 5x = 7.5min. */
export const STUCK_MULTIPLIER = 5;

export interface WalletPoolHealthResult {
	scanned: number;
	stuck: number;
}

export interface WalletPoolHealthDeps {
	db?: Database;
	logger?: Logger;
	nowMs?: number;
	cooldownSeconds?: number;
	stuckMultiplier?: number;
}

interface WalletRow {
	address: string;
	nextAvailableTs: Date | null;
	isActive: boolean;
	balanceBnb: string | null;
}

export async function runWalletPoolHealthCheck(deps: WalletPoolHealthDeps = {}): Promise<WalletPoolHealthResult> {
	const log = deps.logger ?? defaultLogger;
	const db = deps.db ?? getDatabase().db;
	const now = deps.nowMs ?? Date.now();
	const cooldown = deps.cooldownSeconds ?? BUNDLE_WALLET_COOLDOWN_SECONDS;
	const multiplier = deps.stuckMultiplier ?? STUCK_MULTIPLIER;
	const stuckThresholdMs = multiplier * cooldown * 1_000;

	const rows = (await db
		.select({
			address: schema.bundleWalletPool.address,
			nextAvailableTs: schema.bundleWalletPool.nextAvailableTs,
			isActive: schema.bundleWalletPool.isActive,
			balanceBnb: schema.bundleWalletPool.balanceBnb,
		})
		.from(schema.bundleWalletPool)) as WalletRow[];

	const out: WalletPoolHealthResult = { scanned: rows.length, stuck: 0 };

	for (const row of rows) {
		if (!row.isActive) continue;
		if (row.nextAvailableTs == null) continue;
		const nextMs = row.nextAvailableTs.getTime();
		const lockedAheadMs = nextMs - now;
		if (lockedAheadMs <= stuckThresholdMs) continue;

		out.stuck += 1;
		bumpCounter(log, "bundle_wallet_pool_stuck_seconds", Math.floor(lockedAheadMs / 1_000), {
			address: row.address,
		});
		log.warn(
			{
				address: row.address,
				nextAvailableTs: row.nextAvailableTs.toISOString(),
				lockedAheadSeconds: Math.floor(lockedAheadMs / 1_000),
				cooldownSeconds: cooldown,
				thresholdSeconds: multiplier * cooldown,
				balanceBnb: row.balanceBnb,
			},
			"bundle wallet pool: wallet locked far beyond cooldown; releaseWallet may have been missed",
		);
	}

	return out;
}
