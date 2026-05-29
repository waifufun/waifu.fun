/**
 * Bundle bot entry point.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `BUNDLE_BOT_POLL_INTERVAL_MS`
 *     (default 30s) between rounds
 *   - BUNDLE_BOT_RUN_ONCE=1: one round, exit. Cron-friendly.
 *
 * Safety:
 *   - BUNDLE_BOT_DRY_RUN defaults to true in test and false otherwise.
 *   - Dry-run mode logs what it would submit but does not sign, send, or
 *     mutate DB state unless BUNDLE_BOT_DRY_RUN_WRITE_STATUS=true is set for tests.
 *   - Reuses the existing apps/api submitLaunchBundle + bundle-wallet-pool
 *     logic (FOR UPDATE SKIP LOCKED, KMS-decrypted private keys, 90s
 *     cooldown after each successful tx).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Address, Hex } from "viem";
import { http, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

import { schema } from "@waifufun/db";
import { createLogger } from "@waifufun/logger";

import {
	BUNDLE_GRACE_PERIOD_SECONDS,
	type RefundFunction,
	launchVaultRefundAbi,
	runAutoRefund,
} from "./auto-refund.js";
import { loadBundleBotConfig } from "./config.js";
import { pollOnce } from "./loop.js";

// The submitter + wallet pool + repo logic is currently forked from
// apps/api/src/services/*. Both copies must be updated in lockstep until
// the shared code is hoisted into `packages/bundle-runtime/`. See the
// header comments on each submitter/ module.
import { submitLaunchBundle } from "./submitter/index.js";
import { listBundlePendingReady, listBundleRefundCandidates } from "./submitter/launch-repo.js";
import { decryptBundleWalletPk, getActiveWalletByAddress, selectAvailableWallet } from "./submitter/wallet-pool.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactRpc(url: string): string {
	return url.replace(/\/v2\/[^/]+$/, "/v2/<redacted>");
}

async function main(): Promise<void> {
	const config = loadBundleBotConfig();
	const logger = createLogger({ service: "bundle-bot", level: process.env.LOG_LEVEL ?? "info" });
	const dbUrl = process.env.DATABASE_URL ?? process.env.BUNDLE_BOT_DB_URL;
	if (!dbUrl) {
		logger.error({}, "DATABASE_URL or BUNDLE_BOT_DB_URL must be set");
		process.exit(1);
	}

	const client = postgres(dbUrl);
	const db = drizzle(client, { schema });
	const runOnce = process.env.BUNDLE_BOT_RUN_ONCE === "1";
	const autoRefundEnabled = process.env.ENABLE_BUNDLE_BOT_AUTO_REFUND === "true";

	const chain = config.chainId === 97 ? bscTestnet : bsc;
	const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
	const allowPlaintextKeys = config.dryRun || process.env.BUNDLE_ALLOW_PLAINTEXT_WALLET_KEYS === "true";

	const readVault = async (vault: Address): Promise<{ state: number; bundleBot: Address }> => {
		const [state, bundleBot] = await Promise.all([
			publicClient.readContract({ address: vault, abi: launchVaultRefundAbi, functionName: "state" }),
			publicClient.readContract({ address: vault, abi: launchVaultRefundAbi, functionName: "bundleBot" }),
		]);
		return { state: Number(state), bundleBot: bundleBot as Address };
	};
	const resolveBundleBotKey = async (address: Address): Promise<Hex | null> => {
		const wallet = await getActiveWalletByAddress(db, address);
		if (!wallet) return null;
		return decryptBundleWalletPk(wallet.encryptedPk, { allowPlaintext: allowPlaintextKeys });
	};
	const resolveAnyPoolKey = async (): Promise<Hex | null> => {
		const wallet = await selectAvailableWallet(db);
		if (!wallet) return null;
		return decryptBundleWalletPk(wallet.encryptedPk, { allowPlaintext: allowPlaintextKeys });
	};
	const sendRefund = async (vault: Address, fn: RefundFunction, pk: Hex): Promise<string> => {
		const account = privateKeyToAccount(pk);
		const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
		return walletClient.writeContract({ address: vault, abi: launchVaultRefundAbi, functionName: fn, account, chain });
	};

	logger.info(
		{
			chainId: config.chainId,
			rpcUrl: redactRpc(config.rpcUrl),
			puissantUrl: config.puissantUrl,
			pollIntervalMs: config.pollIntervalMs,
			batchSize: config.batchSize,
			maxAttempts: config.maxAttempts,
			dryRun: config.dryRun,
			walletPoolRequired: config.walletPoolRequired,
			dryRunWriteStatus: config.dryRunWriteStatus,
			autoRefundEnabled,
			runOnce,
		},
		"bundle-bot booting",
	);

	if (config.dryRun) {
		logger.warn(
			{ dryRunWriteStatus: config.dryRunWriteStatus },
			"BUNDLE_BOT_DRY_RUN is enabled. The bot will log bundle params but NOT submit real txs or mutate DB state unless BUNDLE_BOT_DRY_RUN_WRITE_STATUS=true.",
		);
	}

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		logger.info({ signal }, "shutting down bundle-bot");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => onSignal(signal));
	}

	do {
		try {
			const result = await pollOnce({
				db,
				config,
				logger,
				listReady: listBundlePendingReady,
				submit: submitLaunchBundle,
			});
			if (result.scanned > 0) {
				logger.info(
					{
						scanned: result.scanned,
						submitted: result.submitted,
						failed: result.failed,
						skipped: result.skipped,
						errors: result.errors,
					},
					"poll round complete",
				);
			}

			const refund = await runAutoRefund({
				db,
				config,
				logger,
				enabled: autoRefundEnabled,
				nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
				graceSeconds: BUNDLE_GRACE_PERIOD_SECONDS,
				listCandidates: listBundleRefundCandidates,
				readVault,
				resolveBundleBotKey,
				resolveAnyPoolKey,
				sendRefund,
			});
			if (refund.scanned > 0) {
				logger.info(
					{
						scanned: refund.scanned,
						sentBundleFailed: refund.sentBundleFailed,
						sentLaunchExpired: refund.sentLaunchExpired,
						skippedNotClosed: refund.skippedNotClosed,
						skippedFlagOff: refund.skippedFlagOff,
						skippedDryRun: refund.skippedDryRun,
						errors: refund.errors,
						autoRefundEnabled,
					},
					"auto-refund round complete",
				);
			}
		} catch (error) {
			logger.error({ err: error instanceof Error ? error.message : String(error) }, "poll round failed");
		}

		if (runOnce || stopped) break;
		await delay(config.pollIntervalMs);
	} while (!stopped);

	await client.end();
	logger.info({}, "bundle-bot exited cleanly");
}

void main().catch((error: unknown) => {
	console.error("bundle-bot boot failed", error);
	process.exit(1);
});
