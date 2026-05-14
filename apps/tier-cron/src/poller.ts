/**
 * W45 tier-advancement polling loop.
 *
 * For each agent_launches row in state="launched" that has a TreasuryLP4
 * address recorded, we:
 *
 *   1. Skip if `nextTierIndex` is already at TIER_COUNT (all tiers deployed).
 *   2. Call `oraclePoke()`. The contract reverts `twap_not_ready()` until the
 *      30-min TWAP window has elapsed since the last poke; we treat that as
 *      a benign "try again next tick" and continue.
 *   3. Try `currentMcUSD()` to confirm the TWAP is now consumable. If that
 *      reverts (still not ready, or no prior snapshot) we skip.
 *   4. Call `checkAndAdvance()`. The contract enforces its own epoch gating
 *      (`epoch_not_ready()`); again we swallow and move on.
 *
 * Each contract is processed independently, errors on one launch don't
 * abort the rest of the round. The loop is idempotent: every round re-reads
 * `nextTierIndex` from chain, so partial progress always picks up cleanly.
 */

import type { Hash } from "viem";
import { BaseError, ContractFunctionRevertedError } from "viem";

import { TIER_COUNT, treasuryLp4Abi } from "./lib/abi.js";
import type { LaunchCandidate, TierCronRuntime } from "./lib/runtime.js";

export interface PollOnceResult {
	candidatesScanned: number;
	bundlesReady: number;
	stuckLaunches: number;
	pokesSent: number;
	advancesSent: number;
	completed: number;
	skipped: number;
	errors: number;
}

/**
 * Default "stuck" threshold: 6 hours after closeTimestamp without graduating
 * or being refunded is a strong signal nobody/nothing has progressed the
 * launch. We surface this with a warn-level log so ops can act on it before
 * depositor frustration mounts.
 */
export const STUCK_LAUNCH_GRACE_SECONDS = 6n * 60n * 60n;

interface ProcessResult {
	pokeSent: boolean;
	advanceSent: boolean;
	completed: boolean;
	skipped: boolean;
	errored: boolean;
}

/**
 * One pass over every launched contract. Returns counters for observability.
 */
export async function pollOnce(runtime: TierCronRuntime): Promise<PollOnceResult> {
	const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
	let bundlesReady = 0;
	let stuckLaunches = 0;
	if (runtime.repo.listStuckLaunches) {
		const stuck = await runtime.repo.listStuckLaunches(nowSeconds, STUCK_LAUNCH_GRACE_SECONDS);
		for (const launch of stuck) {
			stuckLaunches += 1;
			runtime.logger.warn(
				{
					launchId: launch.id,
					vault: launch.vaultAddress,
					router: launch.routerAddress,
					state: launch.state,
					bundleStatus: launch.bundleStatus,
					bundleAttempt: launch.bundleAttempt,
					secondsStuck: launch.secondsStuck.toString(),
				},
				"stuck launch: presale window closed but never graduated or refunded",
			);
		}
	}
	if (runtime.repo.listBundlePendingReady) {
		const pendingBundles = await runtime.repo.listBundlePendingReady(nowSeconds);
		for (const launch of pendingBundles) {
			if (!launch.predictedTokenAddress || !launch.vanitySalt || !launch.flapMetaCid) {
				runtime.logger.warn({ launchId: launch.id }, "bundle pending but salt or Flap metadata is not ready");
				continue;
			}
			bundlesReady += 1;
			runtime.logger.info(
				{ launchId: launch.id, router: launch.routerAddress, attempt: launch.bundleAttempt },
				"bundle pending and ready for BundleRouter.executeBundle submission",
			);
		}
	}

	const candidates = await runtime.repo.listLaunchedWithTreasury();
	const result: PollOnceResult = {
		candidatesScanned: candidates.length,
		bundlesReady,
		stuckLaunches,
		pokesSent: 0,
		advancesSent: 0,
		completed: 0,
		skipped: 0,
		errors: 0,
	};

	if (candidates.length === 0) {
		return result;
	}

	const concurrency = Math.max(1, runtime.config.maxConcurrency);
	let cursor = 0;

	const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
		while (true) {
			const idx = cursor++;
			if (idx >= candidates.length) return;
			const candidate = candidates[idx]!;
			const outcome = await processCandidate(runtime, candidate);
			if (outcome.pokeSent) result.pokesSent += 1;
			if (outcome.advanceSent) result.advancesSent += 1;
			if (outcome.completed) result.completed += 1;
			if (outcome.skipped) result.skipped += 1;
			if (outcome.errored) result.errors += 1;
		}
	});

	await Promise.all(workers);
	return result;
}

async function processCandidate(runtime: TierCronRuntime, candidate: LaunchCandidate): Promise<ProcessResult> {
	const out: ProcessResult = {
		pokeSent: false,
		advanceSent: false,
		completed: false,
		skipped: false,
		errored: false,
	};

	const log = runtime.logger.child({
		launchId: candidate.id,
		treasuryLp: candidate.treasuryLpAddress,
	});

	let nextTier: number;
	try {
		const code = await runtime.publicClient.getBytecode({ address: candidate.treasuryLpAddress });
		if (code == null || code === "0x") {
			out.skipped = true;
			log.debug("treasury address has no contract code; skipping");
			return out;
		}

		nextTier = await runtime.publicClient.readContract({
			address: candidate.treasuryLpAddress,
			abi: treasuryLp4Abi,
			functionName: "nextTierIndex",
		});
	} catch (error) {
		out.errored = true;
		log.error({ err: errMsg(error) }, "nextTierIndex read failed");
		return out;
	}

	if (nextTier >= TIER_COUNT) {
		out.completed = true;
		log.debug({ nextTier }, "all tiers deployed; skipping");
		return out;
	}

	if (!runtime.walletClient) {
		out.skipped = true;
		log.warn("no signer configured; cannot poke or advance");
		return out;
	}

	if (runtime.config.dryRun) {
		out.skipped = true;
		log.info({ nextTier }, "dry run: would poke + checkAndAdvance");
		return out;
	}

	// 1. oraclePoke — benign revert is twap_not_ready (just keep snapshot fresh).
	const pokeOutcome = await sendWrite(runtime, candidate, "oraclePoke");
	if (pokeOutcome.kind === "sent") {
		out.pokeSent = true;
		log.info({ txHash: pokeOutcome.txHash, nextTier }, "oraclePoke submitted");
	} else if (pokeOutcome.kind === "revert" && isExpectedPokeRevert(pokeOutcome.reason)) {
		log.debug({ reason: pokeOutcome.reason }, "oraclePoke benign revert; continuing");
	} else if (pokeOutcome.kind === "revert") {
		out.errored = true;
		log.error({ reason: pokeOutcome.reason }, "oraclePoke unexpected revert");
		return out;
	} else {
		out.errored = true;
		log.error({ err: pokeOutcome.message }, "oraclePoke send failed");
		return out;
	}

	// 2. Confirm TWAP is consumable before paying gas for advance.
	try {
		await runtime.publicClient.readContract({
			address: candidate.treasuryLpAddress,
			abi: treasuryLp4Abi,
			functionName: "currentMcUSD",
		});
	} catch (error) {
		const reason = decodeRevertReason(error);
		if (reason === "twap_not_ready") {
			out.skipped = true;
			log.debug("TWAP not ready; deferring advance");
			return out;
		}
		out.errored = true;
		log.error({ err: errMsg(error) }, "currentMcUSD read failed");
		return out;
	}

	// 3. checkAndAdvance — benign revert is epoch_not_ready.
	const advanceOutcome = await sendWrite(runtime, candidate, "checkAndAdvance");
	if (advanceOutcome.kind === "sent") {
		out.advanceSent = true;
		log.info({ txHash: advanceOutcome.txHash, nextTier }, "checkAndAdvance submitted");
	} else if (advanceOutcome.kind === "revert" && isExpectedAdvanceRevert(advanceOutcome.reason)) {
		log.debug({ reason: advanceOutcome.reason }, "checkAndAdvance benign revert; will retry next tick");
	} else if (advanceOutcome.kind === "revert") {
		out.errored = true;
		log.error({ reason: advanceOutcome.reason }, "checkAndAdvance unexpected revert");
	} else {
		out.errored = true;
		log.error({ err: advanceOutcome.message }, "checkAndAdvance send failed");
	}
	return out;
}

type WriteOutcome =
	| { kind: "sent"; txHash: Hash }
	| { kind: "revert"; reason: string | undefined }
	| { kind: "error"; message: string };

async function sendWrite(
	runtime: TierCronRuntime,
	candidate: LaunchCandidate,
	functionName: "oraclePoke" | "checkAndAdvance",
): Promise<WriteOutcome> {
	const wallet = runtime.walletClient;
	if (!wallet) {
		return { kind: "error", message: "wallet client unavailable" };
	}

	// Simulate first to surface custom-error reverts before paying gas.
	try {
		await runtime.publicClient.simulateContract({
			account: wallet.account,
			address: candidate.treasuryLpAddress,
			abi: treasuryLp4Abi,
			functionName,
		});
	} catch (error) {
		const reason = decodeRevertReason(error);
		if (reason !== undefined) {
			return { kind: "revert", reason };
		}
		return { kind: "error", message: errMsg(error) };
	}

	try {
		const txHash = await sendWithTimeout(
			() =>
				wallet.writeContract({
					address: candidate.treasuryLpAddress,
					abi: treasuryLp4Abi,
					functionName,
					account: wallet.account,
					chain: wallet.chain,
				}),
			runtime.config.perTxTimeoutMs,
		);
		return { kind: "sent", txHash };
	} catch (error) {
		const reason = decodeRevertReason(error);
		if (reason !== undefined) {
			return { kind: "revert", reason };
		}
		return { kind: "error", message: errMsg(error) };
	}
}

async function sendWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
	if (timeoutMs <= 0) return fn();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`tx send exceeded ${timeoutMs}ms`)), timeoutMs);
	});
	try {
		return await Promise.race([fn(), timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

/** Walks viem's nested error chain to extract a custom-error name when present. */
export function decodeRevertReason(error: unknown): string | undefined {
	if (error instanceof BaseError) {
		const reverted = error.walk((err) => err instanceof ContractFunctionRevertedError);
		if (reverted instanceof ContractFunctionRevertedError) {
			const name = reverted.data?.errorName;
			if (typeof name === "string" && name.length > 0) return name;
			if (reverted.reason) return reverted.reason;
			return reverted.shortMessage;
		}
		const msg = error.shortMessage ?? error.message;
		if (typeof msg === "string" && /reverted/i.test(msg)) {
			return msg;
		}
		return undefined;
	}
	if (error instanceof Error) {
		const msg = error.message;
		if (/reverted/i.test(msg)) return msg;
		return undefined;
	}
	return undefined;
}

const POKE_BENIGN_REVERTS = new Set(["twap_not_ready"]);
const ADVANCE_BENIGN_REVERTS = new Set(["epoch_not_ready", "twap_not_ready", "no_tiers_left"]);

function isExpectedPokeRevert(reason: string | undefined): boolean {
	return reason !== undefined && POKE_BENIGN_REVERTS.has(reason);
}

function isExpectedAdvanceRevert(reason: string | undefined): boolean {
	return reason !== undefined && ADVANCE_BENIGN_REVERTS.has(reason);
}

function errMsg(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
