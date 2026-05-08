/**
 * Tier cron loop.
 *
 * Per round (one round per `TIER_CRON_POLL_INTERVAL_MS`):
 *   1. Read all `agent_launches` rows where state=launched and a treasury
 *      address has been recorded.
 *   2. For each launch, in parallel (bounded by `maxConcurrency`):
 *      a. Read `nextTierIndex`, `epochLength`, oracle snapshot timestamp,
 *         and the active tier struct.
 *      b. If `nextTierIndex >= TIER_COUNT` → skip (all tiers deployed).
 *      c. If TWAP window is satisfied → call `oraclePoke()`. We always
 *         simulate first; on revert (e.g. concurrent poke) we just log.
 *      d. After a successful poke (or if the snapshot was already fresh),
 *         and the active tier's epoch has elapsed and isn't paused, call
 *         `checkAndAdvance()`. The contract decides whether to deploy the
 *         next tier; we just supply gas + retries.
 *
 * The loop is a long-running `setTimeout` cycle (NOT setInterval) so each
 * round waits for the previous one to finish before sleeping again. That
 * keeps the gas wallet from getting hammered if RPC stalls.
 *
 * `processOnce` is exported for tests so we can drive a single round
 * without waiting for the timer.
 */

import type { Address } from "viem";

import { TIER_COUNT } from "./lib/abi.js";
import { type ContractState, type OnchainClient, isAdvanceReady, isPokeReady } from "./lib/onchain.js";
import type { LaunchCandidate, TierCronRuntime } from "./lib/runtime.js";

export interface LaunchOutcome {
	launchId: string;
	treasury: Address;
	preState: ContractState;
	pokeAttempted: boolean;
	pokeTxHash?: `0x${string}`;
	pokeStatus?: "success" | "reverted" | "skipped" | "simulate_failed" | "send_failed";
	advanceAttempted: boolean;
	advanceTxHash?: `0x${string}`;
	advanceStatus?: "success" | "reverted" | "skipped" | "simulate_failed" | "send_failed";
	error?: string;
}

export interface RoundResult {
	roundStartedAt: Date;
	candidateCount: number;
	outcomes: LaunchOutcome[];
}

export interface ProcessLaunchDeps {
	onchain: OnchainClient;
	now: () => Date;
	logger: TierCronRuntime["logger"];
	perTxTimeoutMs: number;
	dryRun: boolean;
}

export async function processLaunch(deps: ProcessLaunchDeps, candidate: LaunchCandidate): Promise<LaunchOutcome> {
	const outcome: LaunchOutcome = {
		launchId: candidate.id,
		treasury: candidate.treasuryLpAddress,
		preState: { nextTierIndex: 0, epochLength: 0, oracleSnapshotTimestamp: 0, activeTier: null },
		pokeAttempted: false,
		advanceAttempted: false,
	};

	let state: ContractState;
	try {
		state = await deps.onchain.readState(candidate.treasuryLpAddress);
	} catch (error) {
		outcome.error = errorMessage(error);
		deps.logger.error(
			{ launchId: candidate.id, treasury: candidate.treasuryLpAddress, err: outcome.error },
			"failed to read TreasuryLP4 state",
		);
		return outcome;
	}
	outcome.preState = state;

	if (state.nextTierIndex >= TIER_COUNT) {
		deps.logger.debug(
			{ launchId: candidate.id, treasury: candidate.treasuryLpAddress },
			"all tiers deployed, skipping",
		);
		outcome.pokeStatus = "skipped";
		outcome.advanceStatus = "skipped";
		return outcome;
	}

	const nowSeconds = Math.floor(deps.now().getTime() / 1_000);

	// --- oraclePoke ---------------------------------------------------------
	if (isPokeReady(state, nowSeconds)) {
		outcome.pokeAttempted = true;
		const status = await runWrite(
			deps,
			"oraclePoke",
			candidate,
			() => deps.onchain.simulateOraclePoke(candidate.treasuryLpAddress),
			() => deps.onchain.sendOraclePoke(candidate.treasuryLpAddress),
		);
		outcome.pokeStatus = status.status;
		if (status.txHash) outcome.pokeTxHash = status.txHash;
	} else {
		outcome.pokeStatus = "skipped";
		deps.logger.debug(
			{
				launchId: candidate.id,
				treasury: candidate.treasuryLpAddress,
				oracleSnapshotTimestamp: state.oracleSnapshotTimestamp,
				nowSeconds,
			},
			"TWAP window not elapsed, skipping oraclePoke",
		);
	}

	// --- checkAndAdvance ----------------------------------------------------
	// Re-read state if we just poked, since lastEpochTimestamp on tier 0 may
	// have changed nothing but oracle snapshot did.
	let advanceState = state;
	if (outcome.pokeStatus === "success") {
		try {
			advanceState = await deps.onchain.readState(candidate.treasuryLpAddress);
		} catch (error) {
			outcome.error = errorMessage(error);
			deps.logger.error(
				{ launchId: candidate.id, treasury: candidate.treasuryLpAddress, err: outcome.error },
				"failed to re-read state after oraclePoke",
			);
			return outcome;
		}
	}

	if (advanceState.nextTierIndex >= TIER_COUNT) {
		outcome.advanceStatus = "skipped";
		return outcome;
	}

	if (!isAdvanceReady(advanceState, nowSeconds)) {
		outcome.advanceStatus = "skipped";
		deps.logger.debug(
			{
				launchId: candidate.id,
				treasury: candidate.treasuryLpAddress,
				tier: advanceState.activeTier,
				epochLength: advanceState.epochLength,
				nowSeconds,
			},
			"epoch not ready, skipping checkAndAdvance",
		);
		return outcome;
	}

	outcome.advanceAttempted = true;
	const status = await runWrite(
		deps,
		"checkAndAdvance",
		candidate,
		() => deps.onchain.simulateCheckAndAdvance(candidate.treasuryLpAddress),
		() => deps.onchain.sendCheckAndAdvance(candidate.treasuryLpAddress),
	);
	outcome.advanceStatus = status.status;
	if (status.txHash) outcome.advanceTxHash = status.txHash;

	return outcome;
}

interface WriteResult {
	status: "success" | "reverted" | "simulate_failed" | "send_failed";
	txHash?: `0x${string}`;
}

async function runWrite(
	deps: ProcessLaunchDeps,
	op: "oraclePoke" | "checkAndAdvance",
	candidate: LaunchCandidate,
	simulate: () => Promise<void>,
	send: () => Promise<`0x${string}`>,
): Promise<WriteResult> {
	try {
		await simulate();
	} catch (error) {
		deps.logger.warn(
			{
				launchId: candidate.id,
				treasury: candidate.treasuryLpAddress,
				op,
				err: errorMessage(error),
			},
			`${op} simulation failed, skipping send`,
		);
		return { status: "simulate_failed" };
	}

	if (deps.dryRun) {
		deps.logger.info(
			{ launchId: candidate.id, treasury: candidate.treasuryLpAddress, op },
			`dry-run: would have sent ${op}`,
		);
		return { status: "success" };
	}

	let txHash: `0x${string}`;
	try {
		txHash = await send();
	} catch (error) {
		deps.logger.error(
			{
				launchId: candidate.id,
				treasury: candidate.treasuryLpAddress,
				op,
				err: errorMessage(error),
			},
			`${op} send failed`,
		);
		return { status: "send_failed" };
	}

	try {
		const receipt = await deps.onchain.waitForReceipt(txHash, deps.perTxTimeoutMs);
		if (receipt.status === "success") {
			deps.logger.info(
				{ launchId: candidate.id, treasury: candidate.treasuryLpAddress, op, txHash },
				`${op} confirmed`,
			);
			return { status: "success", txHash };
		}
		deps.logger.warn(
			{ launchId: candidate.id, treasury: candidate.treasuryLpAddress, op, txHash },
			`${op} reverted on-chain`,
		);
		return { status: "reverted", txHash };
	} catch (error) {
		deps.logger.error(
			{
				launchId: candidate.id,
				treasury: candidate.treasuryLpAddress,
				op,
				txHash,
				err: errorMessage(error),
			},
			`${op} receipt wait failed`,
		);
		return { status: "send_failed", txHash };
	}
}

export interface ProcessOnceDeps extends ProcessLaunchDeps {
	repo: TierCronRuntime["repo"];
	maxConcurrency: number;
}

export async function processOnce(deps: ProcessOnceDeps): Promise<RoundResult> {
	const roundStartedAt = deps.now();
	const candidates = await deps.repo.listLaunchedWithTreasury();
	const outcomes: LaunchOutcome[] = [];

	let cursor = 0;
	const workers: Promise<void>[] = [];
	const concurrency = Math.min(deps.maxConcurrency, candidates.length || 1);

	const runWorker = async (): Promise<void> => {
		while (true) {
			const idx = cursor;
			cursor += 1;
			if (idx >= candidates.length) return;
			const candidate = candidates[idx];
			if (!candidate) return;
			const outcome = await processLaunch(deps, candidate);
			outcomes.push(outcome);
		}
	};

	for (let i = 0; i < concurrency; i++) workers.push(runWorker());
	await Promise.all(workers);

	return { roundStartedAt, candidateCount: candidates.length, outcomes };
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
