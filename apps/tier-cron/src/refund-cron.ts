/**
 * P1 followup from INDEXER_AUDIT.md: auto-refund cron.
 *
 * Scope: every poll round, scan for launches that have been stuck past the
 * close window for `AUTO_REFUND_STUCK_SECONDS` (default 12h) AND are
 * under-subscribed AND haven't yet flipped to a terminal state. For each,
 * simulate `enableRefundUnderSubscribed()` on the vault and, if that
 * simulation succeeds AND the feature flag is on AND we have a wallet
 * client, send the tx. Logs each step. Idempotent: the contract reverts
 * `InvalidState` if state is already REFUND/LAUNCHED, which we treat as
 * a no-op and skip silently.
 *
 * Safety:
 *   - feature-flagged off by default (`ENABLE_AUTO_REFUND_CRON=1` to enable)
 *   - dry-run honored
 *   - bails per-launch on any unexpected revert (the stuck-launch warn
 *     log already surfaces it for ops)
 *
 * Why a separate cron action: tier-cron already polls every 5min and has
 * a signer. wiring this into the same poll round keeps the operational
 * surface minimal — no new service, no new key.
 */

import type { Address, Hash } from "viem";
import { BaseError, ContractFunctionRevertedError, parseAbi } from "viem";

import { bumpCounter } from "./lib/metrics.js";
import type { TierCronRuntime } from "./lib/runtime.js";

/** 12h grace before we consider a stuck under-sub launch refund-eligible. */
export const AUTO_REFUND_STUCK_SECONDS = 12n * 60n * 60n;

/**
 * ABI for the single function we call. Sourced from
 * `packages/contracts-evm/contracts/LaunchVault.sol:enableRefundUnderSubscribed`.
 */
export const launchVaultRefundAbi = parseAbi([
	"function enableRefundUnderSubscribed()",
	"function totalDeposited() view returns (uint256)",
	"function presaleCap() view returns (uint256)",
	"function state() view returns (uint8)",
]);

export interface AutoRefundCronResult {
	scanned: number;
	skippedNotEligible: number;
	skippedSimulationReverted: number;
	skippedNoSigner: number;
	skippedDryRun: number;
	skippedFlagOff: number;
	sent: number;
	errors: number;
}

export interface AutoRefundCronDeps {
	nowSeconds: bigint;
	enabled: boolean;
	stuckSeconds: bigint;
}

/**
 * Eligibility filter applied client-side after the stuck-launch query.
 * The contract enforces these too; we duplicate them here to avoid burning
 * an RPC simulate call on rows we already know aren't candidates.
 */
function isEligible(launch: {
	bundleStatus: string;
	state: string;
}): boolean {
	if (launch.bundleStatus !== "pending" && launch.bundleStatus !== "failed_retry") return false;
	if (launch.state === "launched" || launch.state === "failed") return false;
	return true;
}

export async function runAutoRefundCron(
	runtime: TierCronRuntime,
	deps: AutoRefundCronDeps = {
		nowSeconds: BigInt(Math.floor(Date.now() / 1_000)),
		enabled: process.env.ENABLE_AUTO_REFUND_CRON === "1",
		stuckSeconds: AUTO_REFUND_STUCK_SECONDS,
	},
): Promise<AutoRefundCronResult> {
	const out: AutoRefundCronResult = {
		scanned: 0,
		skippedNotEligible: 0,
		skippedSimulationReverted: 0,
		skippedNoSigner: 0,
		skippedDryRun: 0,
		skippedFlagOff: 0,
		sent: 0,
		errors: 0,
	};

	if (!runtime.repo.listStuckLaunches) return out;
	const stuck = await runtime.repo.listStuckLaunches(deps.nowSeconds, deps.stuckSeconds);

	for (const launch of stuck) {
		out.scanned += 1;
		if (!isEligible(launch)) {
			out.skippedNotEligible += 1;
			continue;
		}

		// Cheap pre-check: read totalDeposited + presaleCap from the vault.
		// If totalDeposited >= presaleCap we are NOT under-subscribed, so
		// `enableRefundUnderSubscribed` would revert.
		const undersubscribed = await isUndersubscribed(runtime, launch.vaultAddress).catch(() => null);
		if (undersubscribed === null) {
			out.errors += 1;
			runtime.logger.warn(
				{ launchId: launch.id, vault: launch.vaultAddress },
				"auto-refund: failed to read vault totals; skipping",
			);
			continue;
		}
		if (!undersubscribed) {
			out.skippedNotEligible += 1;
			continue;
		}

		// Simulate first. If state is already REFUND or LAUNCHED, this
		// reverts with `InvalidState` and we treat the launch as already
		// resolved.
		const simulation = await simulateEnableRefund(runtime, launch.vaultAddress);
		if (simulation.kind === "revert") {
			out.skippedSimulationReverted += 1;
			runtime.logger.debug(
				{ launchId: launch.id, vault: launch.vaultAddress, reason: simulation.reason },
				"auto-refund: simulate reverted (probably already in REFUND/LAUNCHED); skipping",
			);
			continue;
		}
		if (simulation.kind === "error") {
			out.errors += 1;
			runtime.logger.warn(
				{ launchId: launch.id, vault: launch.vaultAddress, err: simulation.message },
				"auto-refund: simulate failed; skipping",
			);
			continue;
		}

		if (!deps.enabled) {
			out.skippedFlagOff += 1;
			bumpCounter(runtime.logger, "tier_cron_auto_refund_simulated_total", 1, { launchId: launch.id });
			runtime.logger.info(
				{ launchId: launch.id, vault: launch.vaultAddress, secondsStuck: launch.secondsStuck.toString() },
				"auto-refund: simulate ok but ENABLE_AUTO_REFUND_CRON=0; not sending",
			);
			continue;
		}

		if (!runtime.walletClient) {
			out.skippedNoSigner += 1;
			runtime.logger.warn(
				{ launchId: launch.id, vault: launch.vaultAddress },
				"auto-refund: simulate ok but no TIER_CRON_SIGNER_PK; cannot send",
			);
			continue;
		}

		if (runtime.config.dryRun) {
			out.skippedDryRun += 1;
			runtime.logger.info(
				{ launchId: launch.id, vault: launch.vaultAddress },
				"auto-refund: dry-run; would send enableRefundUnderSubscribed",
			);
			continue;
		}

		try {
			const txHash = await sendEnableRefund(runtime, launch.vaultAddress);
			out.sent += 1;
			bumpCounter(runtime.logger, "tier_cron_auto_refund_sent_total", 1, { launchId: launch.id });
			runtime.logger.info(
				{
					launchId: launch.id,
					vault: launch.vaultAddress,
					txHash,
					secondsStuck: launch.secondsStuck.toString(),
				},
				"auto-refund: enableRefundUnderSubscribed submitted",
			);
		} catch (error) {
			out.errors += 1;
			bumpCounter(runtime.logger, "tier_cron_auto_refund_failed_total", 1, { launchId: launch.id });
			runtime.logger.error(
				{ launchId: launch.id, vault: launch.vaultAddress, err: errMsg(error) },
				"auto-refund: send failed",
			);
		}
	}

	return out;
}

async function isUndersubscribed(runtime: TierCronRuntime, vault: Address): Promise<boolean> {
	const [totalDeposited, presaleCap] = await Promise.all([
		runtime.publicClient.readContract({ address: vault, abi: launchVaultRefundAbi, functionName: "totalDeposited" }),
		runtime.publicClient.readContract({ address: vault, abi: launchVaultRefundAbi, functionName: "presaleCap" }),
	]);
	return totalDeposited < presaleCap;
}

type SimResult = { kind: "ok" } | { kind: "revert"; reason: string | undefined } | { kind: "error"; message: string };

async function simulateEnableRefund(runtime: TierCronRuntime, vault: Address): Promise<SimResult> {
	const wallet = runtime.walletClient;
	const account = wallet?.account.address ?? "0x000000000000000000000000000000000000dead";
	try {
		await runtime.publicClient.simulateContract({
			account,
			address: vault,
			abi: launchVaultRefundAbi,
			functionName: "enableRefundUnderSubscribed",
		});
		return { kind: "ok" };
	} catch (error) {
		const reason = decodeRevertReason(error);
		if (reason !== undefined) return { kind: "revert", reason };
		return { kind: "error", message: errMsg(error) };
	}
}

async function sendEnableRefund(runtime: TierCronRuntime, vault: Address): Promise<Hash> {
	const wallet = runtime.walletClient;
	if (!wallet) throw new Error("walletClient unavailable");
	return wallet.writeContract({
		address: vault,
		abi: launchVaultRefundAbi,
		functionName: "enableRefundUnderSubscribed",
		account: wallet.account,
		chain: wallet.chain,
	});
}

/**
 * Mirrors poller.ts's decoder, duplicated here to avoid a circular import
 * between poller and refund-cron.
 */
function decodeRevertReason(error: unknown): string | undefined {
	if (error instanceof BaseError) {
		const reverted = error.walk((err) => err instanceof ContractFunctionRevertedError);
		if (reverted instanceof ContractFunctionRevertedError) {
			const name = reverted.data?.errorName;
			if (typeof name === "string" && name.length > 0) return name;
			if (reverted.reason) return reverted.reason;
			return reverted.shortMessage;
		}
		const msg = error.shortMessage ?? error.message;
		if (typeof msg === "string" && /reverted/i.test(msg)) return msg;
		return undefined;
	}
	if (error instanceof Error) {
		const msg = error.message;
		if (/reverted/i.test(msg)) return msg;
		return undefined;
	}
	return undefined;
}

function errMsg(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
