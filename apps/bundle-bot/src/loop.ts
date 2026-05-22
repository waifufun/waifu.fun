/**
 * Bundle bot poll loop.
 *
 * Each pass:
 *   1. Query bundle-ready launches: closeTimestamp <= now AND
 *      bundleStatus IN (pending, failed_retry) AND attempt < maxAttempts
 *   2. For each: verify it has the salt-mined predicted addr + flap metadata
 *      CID + on-chain salt commitment, then call submitLaunchBundle
 *   3. Sleep pollIntervalMs and loop
 *
 * The loop is fully idempotent: submitLaunchBundle short-circuits when
 * `bundleStatus IN (submitted, confirmed, refunded)`, and the wallet pool
 * uses FOR UPDATE SKIP LOCKED so two parallel bots cannot double-check-out
 * the same wallet.
 */

import type { AgentLaunchRow } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import type { BundleBotConfig } from "./config.js";

export interface PollDeps {
	db: Database;
	config: BundleBotConfig;
	logger: {
		info: (o: object, m?: string) => void;
		warn: (o: object, m?: string) => void;
		error: (o: object, m?: string) => void;
	};
	listReady: (db: Database, nowSeconds: bigint) => Promise<AgentLaunchRow[]>;
	submit: (
		db: Database,
		launch: AgentLaunchRow,
		opts: {
			chainId: number;
			rpcUrl: string;
			privateRpcUrl: string;
			dryRun: boolean;
			dryRunWriteStatus: boolean;
			allowSingleWalletFallback: boolean;
			maxAttempts: number;
		},
	) => Promise<{
		status: string;
		txHash?: string;
		attempt: number;
		reason?: string;
		dryRun?: boolean;
		callData?: string;
		routerAddress?: string;
		tipBnb?: string;
	}>;
}

export interface PollResult {
	scanned: number;
	skipped: number;
	submitted: number;
	failed: number;
	errors: number;
}

export async function pollOnce(deps: PollDeps): Promise<PollResult> {
	const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
	const result: PollResult = { scanned: 0, skipped: 0, submitted: 0, failed: 0, errors: 0 };

	let ready: AgentLaunchRow[];
	try {
		ready = await deps.listReady(deps.db, nowSeconds);
	} catch (error) {
		deps.logger.error({ err: errorMessage(error) }, "listReady failed");
		result.errors += 1;
		return result;
	}

	result.scanned = ready.length;
	if (ready.length === 0) return result;

	const batch = ready.slice(0, deps.config.batchSize);

	for (const launch of batch) {
		if (!launch.predictedTokenAddress || !launch.vanitySalt || !launch.flapMetaCid) {
			deps.logger.warn(
				{
					launchId: launch.id,
					hasPredicted: !!launch.predictedTokenAddress,
					hasSalt: !!launch.vanitySalt,
					hasMeta: !!launch.flapMetaCid,
				},
				"bundle pending but launch is not fully prepared (missing salt, predicted addr, or flap meta CID)",
			);
			result.skipped += 1;
			continue;
		}
		if (launch.bundleAttempt >= deps.config.maxAttempts) {
			deps.logger.warn(
				{ launchId: launch.id, attempt: launch.bundleAttempt, max: deps.config.maxAttempts },
				"bundle has hit max attempts; should be terminal",
			);
			result.skipped += 1;
			continue;
		}

		try {
			const out = await deps.submit(deps.db, launch, {
				chainId: deps.config.chainId,
				rpcUrl: deps.config.rpcUrl,
				privateRpcUrl: deps.config.puissantUrl,
				dryRun: deps.config.dryRun,
				dryRunWriteStatus: deps.config.dryRunWriteStatus,
				allowSingleWalletFallback: !deps.config.walletPoolRequired,
				maxAttempts: deps.config.maxAttempts,
			});
			deps.logger.info(
				{
					launchId: launch.id,
					router: launch.routerAddress,
					attempt: out.attempt,
					status: out.status,
					txHash: out.txHash,
					reason: out.reason,
					dryRun: deps.config.dryRun,
					dryRunWriteStatus: deps.config.dryRunWriteStatus,
					callData: out.callData,
					routerAddress: out.routerAddress,
					tipBnb: out.tipBnb,
				},
				"bundle submit attempted",
			);
			if (out.status === "submitted") result.submitted += 1;
			else if (out.status === "failed_terminal" || out.status === "failed_retry") result.failed += 1;
		} catch (error) {
			deps.logger.error({ launchId: launch.id, err: errorMessage(error) }, "bundle submit threw");
			result.errors += 1;
		}
	}

	return result;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
