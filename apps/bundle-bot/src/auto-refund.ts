/**
 * Auto-enable depositor refunds for launches whose bundle permanently failed.
 *
 * Background (waifufun#598): when `BundleRouter.executeBundle()` never lands —
 * the bot exhausts `maxAttempts`, or the launch is otherwise stuck CLOSED —
 * depositors' BNB sits trapped in the LaunchVault until *someone* flips the
 * vault into REFUND state. Today that is a manual ops step. This module does
 * it automatically once the on-chain grace window has elapsed.
 *
 * The vault exposes two relevant transitions, both gated on
 * `state == CLOSED && now >= closeTimestamp + BUNDLE_GRACE_PERIOD`:
 *
 *   - `enableRefundBundleFailed()`  — restricted to the registered `bundleBot`
 *   - `enableRefundLaunchExpired()` — permissionless
 *
 * They have identical preconditions and identical effect (CLOSED → REFUND,
 * emitting `RefundEnabled`). The only difference is the reason string in the
 * event. The bundle-bot signs with a *rotating wallet pool*, while each vault
 * registers a *single* immutable `bundleBot` EOA at creation. So we can only
 * use the gated call when the pool happens to hold that exact key; otherwise
 * we fall back to the permissionless call, which rescues depositors all the
 * same. We prefer the gated call when possible so the on-chain event reads
 * "bundle-failed" (the accurate cause) rather than the generic "launch-expired".
 *
 * Safety:
 *   - feature-flagged off by default (`ENABLE_BUNDLE_BOT_AUTO_REFUND=true`)
 *   - dry-run honored (config.dryRun): logs the intended call, sends nothing
 *   - re-reads authoritative on-chain state before sending; a vault that has
 *     already left CLOSED is skipped as a no-op
 */

import type { AgentLaunchRow } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import type { Address, Hex } from "viem";
import { parseAbi } from "viem";

import type { BundleBotConfig } from "./config.js";

/** Mirrors `LaunchVault.BUNDLE_GRACE_PERIOD` (24h after close). */
export const BUNDLE_GRACE_PERIOD_SECONDS = 86_400n;

/** Index of `State.CLOSED` in the on-chain `LaunchVault.State` enum. */
export const VAULT_STATE_CLOSED = 1;

/**
 * ABI for the calls this module makes. Sourced from
 * `packages/contracts-evm/contracts/LaunchVault.sol`.
 */
export const launchVaultRefundAbi = parseAbi([
	"function enableRefundBundleFailed()",
	"function enableRefundLaunchExpired()",
	"function bundleBot() view returns (address)",
	"function state() view returns (uint8)",
]);

export type RefundFunction = "enableRefundBundleFailed" | "enableRefundLaunchExpired";

export interface AutoRefundResult {
	scanned: number;
	skippedNotClosed: number;
	skippedWithinGrace: number;
	skippedFlagOff: number;
	skippedDryRun: number;
	sentBundleFailed: number;
	sentLaunchExpired: number;
	errors: number;
}

export interface AutoRefundDeps {
	db: Database;
	config: BundleBotConfig;
	logger: {
		info: (o: object, m?: string) => void;
		warn: (o: object, m?: string) => void;
		error: (o: object, m?: string) => void;
	};
	enabled: boolean;
	nowSeconds: bigint;
	graceSeconds: bigint;
	/** Candidate launches (DB pre-filter: state=closed AND past grace). */
	listCandidates: (db: Database, nowSeconds: bigint, graceSeconds: bigint) => Promise<AgentLaunchRow[]>;
	/** Authoritative on-chain read of the vault's state enum + registered bundleBot. */
	readVault: (vault: Address) => Promise<{ state: number; bundleBot: Address }>;
	/**
	 * Resolve a private key for an exact address from the bundle wallet pool,
	 * or null if the pool does not hold it. Used to decide whether the gated
	 * `enableRefundBundleFailed()` is callable.
	 */
	resolveBundleBotKey: (address: Address) => Promise<Hex | null>;
	/** Any available pool key, for the permissionless fallback. Null if none. */
	resolveAnyPoolKey: () => Promise<Hex | null>;
	/** Sign + send the refund-enable tx; returns the tx hash. */
	sendRefund: (vault: Address, fn: RefundFunction, pk: Hex) => Promise<string>;
}

function logMetric(logger: AutoRefundDeps["logger"], name: string, fields: Record<string, unknown>): void {
	logger.info({ metric: name, value: 1, ...fields }, name);
}

export async function runAutoRefund(deps: AutoRefundDeps): Promise<AutoRefundResult> {
	const out: AutoRefundResult = {
		scanned: 0,
		skippedNotClosed: 0,
		skippedWithinGrace: 0,
		skippedFlagOff: 0,
		skippedDryRun: 0,
		sentBundleFailed: 0,
		sentLaunchExpired: 0,
		errors: 0,
	};

	let candidates: AgentLaunchRow[];
	try {
		candidates = await deps.listCandidates(deps.db, deps.nowSeconds, deps.graceSeconds);
	} catch (error) {
		deps.logger.error({ err: errorMessage(error) }, "auto-refund: listCandidates failed");
		out.errors += 1;
		return out;
	}

	out.scanned = candidates.length;

	for (const launch of candidates) {
		const vault = launch.vaultAddress as Address;

		// Belt-and-suspenders grace check against the row snapshot. The DB query
		// already filters this, but recompute so a mis-wired query can never send
		// a premature refund.
		if (launch.closeTimestamp + deps.graceSeconds > deps.nowSeconds) {
			out.skippedWithinGrace += 1;
			continue;
		}

		let onchain: { state: number; bundleBot: Address };
		try {
			onchain = await deps.readVault(vault);
		} catch (error) {
			out.errors += 1;
			deps.logger.warn(
				{ launchId: launch.id, vault, err: errorMessage(error) },
				"auto-refund: vault read failed; skipping",
			);
			continue;
		}

		if (onchain.state !== VAULT_STATE_CLOSED) {
			// Already LAUNCHED / REFUND / OPEN — nothing to do.
			out.skippedNotClosed += 1;
			continue;
		}

		if (!deps.enabled) {
			out.skippedFlagOff += 1;
			logMetric(deps.logger, "bundle_bot_auto_refund_simulated_total", { launchId: launch.id });
			deps.logger.info(
				{ launchId: launch.id, vault, closeTimestamp: launch.closeTimestamp.toString() },
				"auto-refund: eligible but ENABLE_BUNDLE_BOT_AUTO_REFUND is off; not sending",
			);
			continue;
		}

		if (deps.config.dryRun) {
			out.skippedDryRun += 1;
			deps.logger.info({ launchId: launch.id, vault }, "auto-refund: dry-run; would enable refund");
			continue;
		}

		// Decide which call to make: prefer the gated, accurate one when the pool
		// holds the registered bundleBot key; otherwise permissionless fallback.
		let fn: RefundFunction;
		let pk: Hex | null;
		try {
			const bundleBotKey = await deps.resolveBundleBotKey(onchain.bundleBot);
			if (bundleBotKey) {
				fn = "enableRefundBundleFailed";
				pk = bundleBotKey;
			} else {
				fn = "enableRefundLaunchExpired";
				pk = await deps.resolveAnyPoolKey();
			}
		} catch (error) {
			out.errors += 1;
			deps.logger.warn(
				{ launchId: launch.id, vault, err: errorMessage(error) },
				"auto-refund: key resolution failed; skipping",
			);
			continue;
		}

		if (!pk) {
			out.errors += 1;
			deps.logger.warn(
				{ launchId: launch.id, vault, bundleBot: onchain.bundleBot },
				"auto-refund: no signer available (pool empty and bundleBot key not held); skipping",
			);
			continue;
		}

		try {
			const txHash = await deps.sendRefund(vault, fn, pk);
			if (fn === "enableRefundBundleFailed") out.sentBundleFailed += 1;
			else out.sentLaunchExpired += 1;
			logMetric(deps.logger, "bundle_bot_auto_refund_sent_total", { launchId: launch.id, fn });
			deps.logger.info({ launchId: launch.id, vault, fn, txHash }, "auto-refund: refund enabled");
		} catch (error) {
			out.errors += 1;
			logMetric(deps.logger, "bundle_bot_auto_refund_failed_total", { launchId: launch.id, fn });
			deps.logger.error({ launchId: launch.id, vault, fn, err: errorMessage(error) }, "auto-refund: send failed");
		}
	}

	return out;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
