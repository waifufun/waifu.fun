/**
 * LaunchCreated handler. Inserts (or no-ops) the canonical agent_launches row
 * for each new on-chain launch from the wave H LaunchFactory.
 *
 * The wave H factory emits the predicted token address (CREATE2-derived) up
 * front; the real Flap token mints inside BundleRouter.executeBundle and is
 * stitched in later via the Portal.TokenCreated handler. So we record:
 *   - tokenAddress    := predictedToken (initial guess; final value reconciled
 *                                        when TokenCreated lands)
 *   - predictedTokenAddress := predictedToken (matches CREATE2 prediction)
 *   - vaultAddress, routerAddress, treasuryLpAddress  := from event
 *   - closeTimestamp := from event (NOT block timestamp)
 *
 * The W42 API may have already pre-inserted the row (status=pending) when
 * the user clicked "launch". In that case we update the row with the
 * authoritative on-chain addresses + tier config snapshot.
 */

import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { LaunchCreatedEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export async function handleLaunchCreated(
	runtime: LaunchIndexerRuntime,
	event: LaunchCreatedEvent,
): Promise<{ launchId: string }> {
	const { predictedToken, vault, router, treasuryLp, creator, tier, presaleCap, v2BuyBnb, closeTimestamp } = event.data;

	// Try insert; on conflict update the on-chain immutables.
	const inserted = await runtime.db
		.insert(schema.agentLaunches)
		.values({
			tokenAddress: predictedToken.toLowerCase(),
			predictedTokenAddress: predictedToken.toLowerCase(),
			vaultAddress: vault.toLowerCase(),
			routerAddress: router.toLowerCase(),
			treasuryLpAddress: treasuryLp.toLowerCase(),
			creator: creator.toLowerCase(),
			tier,
			presaleCap,
			v2BuyBnb,
			vestingEnabled: 0,
			state: "open",
			closeTimestamp: BigInt(closeTimestamp),
			createTxHash: event.txHash,
			createBlockNumber: event.blockNumber,
		})
		.onConflictDoUpdate({
			target: schema.agentLaunches.tokenAddress,
			set: {
				predictedTokenAddress: predictedToken.toLowerCase(),
				vaultAddress: vault.toLowerCase(),
				routerAddress: router.toLowerCase(),
				treasuryLpAddress: treasuryLp.toLowerCase(),
				creator: creator.toLowerCase(),
				tier,
				presaleCap,
				v2BuyBnb,
				closeTimestamp: BigInt(closeTimestamp),
				createTxHash: event.txHash,
				createBlockNumber: event.blockNumber,
				updatedAt: sql`now()`,
			},
		})
		.returning({ id: schema.agentLaunches.id });

	const launchId = inserted[0]?.id;
	if (!launchId) {
		// Fallback: read-back by token address.
		const [row] = await runtime.db
			.select({ id: schema.agentLaunches.id })
			.from(schema.agentLaunches)
			.where(eq(schema.agentLaunches.tokenAddress, predictedToken.toLowerCase()))
			.limit(1);
		if (!row) {
			throw new Error(`agent_launches row not found after upsert for token ${predictedToken}`);
		}
		return { launchId: row.id };
	}

	runtime.logger.info(
		{
			launchId,
			predictedToken: predictedToken.toLowerCase(),
			vault: vault.toLowerCase(),
			router: router.toLowerCase(),
			treasuryLp: treasuryLp.toLowerCase(),
			tier,
			block: event.blockNumber.toString(),
			tx: event.txHash,
		},
		"LaunchCreated indexed",
	);

	return { launchId };
}
