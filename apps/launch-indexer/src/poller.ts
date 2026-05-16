/**
 * Launch indexer polling loop.
 *
 * Two-phase per tick:
 *   1. Poll LaunchFactory for LaunchCreated → upsert agent_launches rows and
 *      bootstrap per-launch cursors (one per vault, one per router).
 *   2. Poll every active vault + router address up to the same target block,
 *      dispatch handlers, advance per-contract cursors.
 *
 * `target_block = latest - confirmations` so we only persist finalized state.
 */

import { schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

import { handleFlapLaunchedToDex, handlePortalTokenCreated } from "./handlers/flap.js";
import { handleLaunchCreated } from "./handlers/launch-created.js";
import { handleBundleExecuted, handleBundleFailed } from "./handlers/router.js";
import {
	handleClaimed,
	handleClosed,
	handleDeposited,
	handleDistributed,
	handleLaunchExecuted,
	handleRefundEnabled,
	handleRefunded,
	handleRouterSet,
	handleWithdrawn,
} from "./handlers/vault.js";
import type { LaunchVaultEvent } from "./lib/events.js";
import {
	type LaunchIndexerRuntime,
	factoryCursorId,
	flapCursorId,
	portalCursorId,
	routerCursorId,
	vaultCursorId,
} from "./lib/runtime.js";

interface AgentLaunchRow {
	id: string;
	vaultAddress: string;
	routerAddress: string;
}

export async function listAgentLaunches(runtime: LaunchIndexerRuntime): Promise<AgentLaunchRow[]> {
	const rows = await runtime.db
		.select({
			id: schema.agentLaunches.id,
			vaultAddress: schema.agentLaunches.vaultAddress,
			routerAddress: schema.agentLaunches.routerAddress,
		})
		.from(schema.agentLaunches);
	return rows;
}

async function findLaunchByVault(runtime: LaunchIndexerRuntime, vault: string): Promise<{ id: string } | null> {
	const [row] = await runtime.db
		.select({ id: schema.agentLaunches.id })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.vaultAddress, vault.toLowerCase()))
		.limit(1);
	return row ?? null;
}

async function findLaunchByRouter(runtime: LaunchIndexerRuntime, router: string): Promise<{ id: string } | null> {
	const [row] = await runtime.db
		.select({ id: schema.agentLaunches.id })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.routerAddress, router.toLowerCase()))
		.limit(1);
	return row ?? null;
}

export async function dispatchVaultEvent(
	runtime: LaunchIndexerRuntime,
	event: LaunchVaultEvent,
	launchId: string,
): Promise<void> {
	switch (event.eventName) {
		case "RouterSet":
			await handleRouterSet(runtime, event, { launchId });
			return;
		case "Deposited":
			await handleDeposited(runtime, event, { launchId });
			return;
		case "Withdrawn":
			await handleWithdrawn(runtime, event, { launchId });
			return;
		case "Closed":
			await handleClosed(runtime, event, { launchId });
			return;
		case "LaunchExecuted":
			await handleLaunchExecuted(runtime, event, { launchId });
			return;
		case "Distributed":
			await handleDistributed(runtime, event, { launchId });
			return;
		case "RefundEnabled":
			await handleRefundEnabled(runtime, event, { launchId });
			return;
		case "Refunded":
			await handleRefunded(runtime, event, { launchId });
			return;
		case "Claimed":
			await handleClaimed(runtime, event, { launchId });
			return;
	}
}

export interface PollOnceOptions {
	/** Override the chain head; defaults to source.getLatestBlock(). */
	latestBlock?: bigint;
}

export interface PollOnceResult {
	scannedToBlock: bigint;
	factoryEventCount: number;
	portalEventCount: number;
	flapEventCount: number;
	vaultEventCount: number;
	routerEventCount: number;
}

export async function pollOnce(runtime: LaunchIndexerRuntime, options: PollOnceOptions = {}): Promise<PollOnceResult> {
	const latest = options.latestBlock ?? (await runtime.source.getLatestBlock());
	const targetBlock = latest > runtime.config.confirmations ? latest - runtime.config.confirmations : 0n;

	if (targetBlock === 0n) {
		return {
			scannedToBlock: 0n,
			factoryEventCount: 0,
			portalEventCount: 0,
			flapEventCount: 0,
			vaultEventCount: 0,
			routerEventCount: 0,
		};
	}

	// --- Phase 1: factory ----------------------------------------------------
	const factoryId = factoryCursorId(runtime.config.chainId, runtime.config.launchFactoryAddress);
	const factoryCursor = await runtime.cursors.ensure({
		id: factoryId,
		contractAddress: runtime.config.launchFactoryAddress,
		initialBlock: runtime.config.startBlock > 0n ? runtime.config.startBlock - 1n : 0n,
	});

	const factoryFrom = factoryCursor.lastBlock + 1n;
	const factoryTo = clampUpper(factoryFrom + runtime.config.maxBlocksPerPoll - 1n, targetBlock);

	let factoryEventCount = 0;
	if (factoryFrom <= factoryTo) {
		const factoryEvents = await runtime.source.getEvents({
			addresses: [runtime.config.launchFactoryAddress],
			fromBlock: factoryFrom,
			toBlock: factoryTo,
		});

		for (const event of factoryEvents) {
			if (event.eventName !== "LaunchCreated") continue;
			try {
				const { launchId } = await handleLaunchCreated(runtime, event);
				// Bootstrap per-launch cursors at the block that created them.
				await runtime.cursors.ensure({
					id: vaultCursorId(runtime.config.chainId, event.data.vault),
					contractAddress: event.data.vault,
					initialBlock: event.blockNumber - 1n,
				});
				await runtime.cursors.ensure({
					id: routerCursorId(runtime.config.chainId, event.data.router),
					contractAddress: event.data.router,
					initialBlock: event.blockNumber - 1n,
				});
				factoryEventCount += 1;
				runtime.logger.debug({ launchId, block: event.blockNumber.toString() }, "registered launch contracts");
			} catch (error) {
				runtime.logger.error(
					{
						err: error instanceof Error ? error.message : String(error),
						tx: event.txHash,
					},
					"LaunchCreated handler failed",
				);
			}
		}

		await runtime.cursors.advance(factoryId, factoryTo);
	}

	// --- Phase 1b: Flap Portal TokenCreated -----------------------------------
	const portalAddress = runtime.config.portalAddress ?? "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
	const portalId = portalCursorId(runtime.config.chainId, portalAddress);
	const portalCursor = await runtime.cursors.ensure({
		id: portalId,
		contractAddress: portalAddress,
		initialBlock: runtime.config.startBlock > 0n ? runtime.config.startBlock - 1n : 0n,
	});
	const portalFrom = portalCursor.lastBlock + 1n;
	const portalTo = clampUpper(portalFrom + runtime.config.maxBlocksPerPoll - 1n, targetBlock);
	let portalEventCount = 0;
	if (portalFrom <= portalTo) {
		const portalEvents = await runtime.source.getEvents({
			addresses: [portalAddress],
			fromBlock: portalFrom,
			toBlock: portalTo,
		});
		for (const event of portalEvents) {
			if (event.eventName !== "TokenCreated") continue;
			try {
				const matched = await handlePortalTokenCreated(runtime, event);
				if (matched) portalEventCount += 1;
			} catch (error) {
				runtime.logger.error(
					{ err: error instanceof Error ? error.message : String(error), tx: event.txHash },
					"Portal TokenCreated handler failed",
				);
			}
		}
		await runtime.cursors.advance(portalId, portalTo);
	}

	// --- Phase 1c: Flap graduation -------------------------------------------
	let flapEventCount = 0;
	if (runtime.config.flapTokenFactoryAddress) {
		const flapId = flapCursorId(runtime.config.chainId, runtime.config.flapTokenFactoryAddress);
		const flapCursor = await runtime.cursors.ensure({
			id: flapId,
			contractAddress: runtime.config.flapTokenFactoryAddress,
			initialBlock: runtime.config.startBlock > 0n ? runtime.config.startBlock - 1n : 0n,
		});
		const flapFrom = flapCursor.lastBlock + 1n;
		const flapTo = clampUpper(flapFrom + runtime.config.maxBlocksPerPoll - 1n, targetBlock);
		if (flapFrom <= flapTo) {
			const flapEvents = await runtime.source.getEvents({
				addresses: [runtime.config.flapTokenFactoryAddress],
				fromBlock: flapFrom,
				toBlock: flapTo,
			});
			for (const event of flapEvents) {
				if (event.eventName !== "LaunchedToDEX") continue;
				try {
					const matched = await handleFlapLaunchedToDex(runtime, event);
					if (matched) flapEventCount += 1;
				} catch (error) {
					runtime.logger.error(
						{ err: error instanceof Error ? error.message : String(error), tx: event.txHash },
						"Flap LaunchedToDEX handler failed",
					);
				}
			}
			await runtime.cursors.advance(flapId, flapTo);
		}
	}

	// --- Phase 2: vaults + routers ------------------------------------------
	const launches = await listAgentLaunches(runtime);
	let vaultEventCount = 0;
	let routerEventCount = 0;

	// Group cursors by chunk window for efficiency. Each contract has its own
	// cursor (since they came online at different blocks), so we still issue
	// one getLogs per contract here. A future optimization would batch by
	// shared `(fromBlock, toBlock)` windows.
	for (const launch of launches) {
		const vCursorId = vaultCursorId(runtime.config.chainId, launch.vaultAddress as `0x${string}`);
		const rCursorId = routerCursorId(runtime.config.chainId, launch.routerAddress as `0x${string}`);

		// Vault
		const vCursor = await runtime.cursors.read(vCursorId);
		if (vCursor && vCursor.lastBlock < targetBlock) {
			const fromBlock = vCursor.lastBlock + 1n;
			const toBlock = clampUpper(fromBlock + runtime.config.maxBlocksPerPoll - 1n, targetBlock);
			const events = await runtime.source.getEvents({
				addresses: [launch.vaultAddress as `0x${string}`],
				fromBlock,
				toBlock,
			});
			let failed = false;
			for (const event of events) {
				if (
					event.eventName === "LaunchCreated" ||
					event.eventName === "BundleExecuted" ||
					event.eventName === "BundleFailed" ||
					event.eventName === "TokenCreated" ||
					event.eventName === "LaunchedToDEX"
				)
					continue;
				try {
					await dispatchVaultEvent(runtime, event, launch.id);
					vaultEventCount += 1;
				} catch (error) {
					runtime.logger.error(
						{
							err: error instanceof Error ? error.message : String(error),
							launchId: launch.id,
							eventName: event.eventName,
							tx: event.txHash,
						},
						"vault handler failed",
					);
					failed = true;
					break;
				}
			}
			if (!failed) await runtime.cursors.advance(vCursorId, toBlock);
		}

		// Router
		const rCursor = await runtime.cursors.read(rCursorId);
		if (rCursor && rCursor.lastBlock < targetBlock) {
			const fromBlock = rCursor.lastBlock + 1n;
			const toBlock = clampUpper(fromBlock + runtime.config.maxBlocksPerPoll - 1n, targetBlock);
			const events = await runtime.source.getEvents({
				addresses: [launch.routerAddress as `0x${string}`],
				fromBlock,
				toBlock,
			});
			let failed = false;
			for (const event of events) {
				if (event.eventName !== "BundleExecuted" && event.eventName !== "BundleFailed") continue;
				try {
					if (event.eventName === "BundleExecuted") {
						await handleBundleExecuted(runtime, event, { launchId: launch.id });
					} else {
						await handleBundleFailed(runtime, event, { launchId: launch.id });
					}
					routerEventCount += 1;
				} catch (error) {
					runtime.logger.error(
						{
							err: error instanceof Error ? error.message : String(error),
							launchId: launch.id,
							eventName: event.eventName,
							tx: event.txHash,
						},
						"router handler failed",
					);
					failed = true;
					break;
				}
			}
			if (!failed) await runtime.cursors.advance(rCursorId, toBlock);
		}
	}

	return {
		scannedToBlock: targetBlock,
		factoryEventCount,
		portalEventCount,
		flapEventCount,
		vaultEventCount,
		routerEventCount,
	};
}

function clampUpper(candidate: bigint, upper: bigint): bigint {
	return candidate > upper ? upper : candidate;
}

// Exported for tests that want to drive the poller without the long-running
// `setInterval` loop.
export const __testing = { findLaunchByVault, findLaunchByRouter };
