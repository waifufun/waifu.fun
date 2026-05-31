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
import type { Address, Hex } from "viem";

import { VAULT_STATE_CLOSED } from "./auto-refund.js";
import type { BundleBotConfig } from "./config.js";

export interface BundleFailedRefundDeps {
	enabled: boolean;
	graceSeconds: bigint;
	nowSeconds: () => bigint;
	readVault: (vault: Address) => Promise<{ state: number; bundleBot: Address }>;
	resolveBundleBotKey: (address: Address) => Promise<Hex | null>;
	sendRefundBundleFailed: (vault: Address, pk: Hex) => Promise<string>;
	markRefunded: (db: Database, launch: AgentLaunchRow, txHash: string) => Promise<void>;
}

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
	autoRefundBundleFailed?: BundleFailedRefundDeps;
}

export interface PollResult {
	scanned: number;
	skipped: number;
	submitted: number;
	failed: number;
	refundEnabled: number;
	refundSkipped: number;
	errors: number;
}

export async function pollOnce(deps: PollDeps): Promise<PollResult> {
	const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
	const result: PollResult = {
		scanned: 0,
		skipped: 0,
		submitted: 0,
		failed: 0,
		refundEnabled: 0,
		refundSkipped: 0,
		errors: 0,
	};

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
			const refund = await maybeEnableBundleFailedRefund(deps, launch);
			if (refund === "sent") result.refundEnabled += 1;
			else if (refund === "skipped") result.refundSkipped += 1;
			else if (refund === "error") result.errors += 1;
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
			else if (out.status === "failed_terminal" || out.status === "failed_retry") {
				result.failed += 1;
				if (out.status === "failed_terminal") {
					const refund = await maybeEnableBundleFailedRefund(deps, launch);
					if (refund === "sent") result.refundEnabled += 1;
					else if (refund === "skipped") result.refundSkipped += 1;
					else if (refund === "error") result.errors += 1;
				}
			}
		} catch (error) {
			deps.logger.error({ launchId: launch.id, err: errorMessage(error) }, "bundle submit threw");
			result.errors += 1;
		}
	}

	return result;
}

type BundleFailedRefundResult = "sent" | "skipped" | "error" | "not_configured";

async function maybeEnableBundleFailedRefund(
	deps: PollDeps,
	launch: AgentLaunchRow,
): Promise<BundleFailedRefundResult> {
	const refund = deps.autoRefundBundleFailed;
	if (!refund) return "not_configured";

	const vault = launch.vaultAddress as Address;
	if (!refund.enabled) {
		deps.logger.info(
			{ launchId: launch.id, vault },
			"bundle failed terminal but ENABLE_BUNDLE_BOT_AUTO_REFUND is off; not sending refund tx",
		);
		return "skipped";
	}

	if (launch.closeTimestamp + refund.graceSeconds > refund.nowSeconds()) {
		deps.logger.info(
			{
				launchId: launch.id,
				vault,
				closeTimestamp: launch.closeTimestamp.toString(),
				graceSeconds: refund.graceSeconds.toString(),
			},
			"bundle failed terminal but refund grace period has not elapsed",
		);
		return "skipped";
	}

	let onchain: { state: number; bundleBot: Address };
	try {
		onchain = await refund.readVault(vault);
	} catch (error) {
		deps.logger.warn(
			{ launchId: launch.id, vault, err: errorMessage(error) },
			"bundle failed terminal auto-refund: vault read failed; skipping",
		);
		return "error";
	}

	if (onchain.state !== VAULT_STATE_CLOSED) {
		deps.logger.info(
			{ launchId: launch.id, vault, state: onchain.state },
			"bundle failed terminal auto-refund: vault is no longer CLOSED",
		);
		return "skipped";
	}

	if (deps.config.dryRun) {
		deps.logger.info(
			{ launchId: launch.id, vault, bundleBot: onchain.bundleBot },
			"bundle failed terminal auto-refund: dry-run; would send enableRefundBundleFailed",
		);
		return "skipped";
	}

	let pk: Hex | null;
	try {
		pk = await refund.resolveBundleBotKey(onchain.bundleBot);
	} catch (error) {
		deps.logger.warn(
			{ launchId: launch.id, vault, bundleBot: onchain.bundleBot, err: errorMessage(error) },
			"bundle failed terminal auto-refund: bundleBot key resolution failed; skipping",
		);
		return "error";
	}
	if (!pk) {
		deps.logger.warn(
			{ launchId: launch.id, vault, bundleBot: onchain.bundleBot },
			"bundle failed terminal auto-refund: bundleBot key not held; skipping",
		);
		return "skipped";
	}

	try {
		const txHash = await refund.sendRefundBundleFailed(vault, pk);
		await refund.markRefunded(deps.db, launch, txHash);
		deps.logger.info(
			{ launchId: launch.id, vault, bundleBot: onchain.bundleBot, txHash },
			"bundle failed terminal auto-refund: enableRefundBundleFailed submitted",
		);
		return "sent";
	} catch (error) {
		deps.logger.error(
			{ launchId: launch.id, vault, bundleBot: onchain.bundleBot, err: errorMessage(error) },
			"bundle failed terminal auto-refund: send failed",
		);
		return "error";
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
