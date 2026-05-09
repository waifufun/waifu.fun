/**
 * LaunchCreated handler. Inserts (or no-ops) the canonical agent_launches row
 * for each new on-chain launch.
 *
 * The W42 API may have already pre-inserted the row (status=submitted) when
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
	const { token, vault, router, taxSplitter, creator, tier, presaleCap, v2BuyBnb, vestingEnabled } = event.data;

	// Try insert; on conflict update the on-chain immutables.
	const inserted = await runtime.db
		.insert(schema.agentLaunches)
		.values({
			tokenAddress: token.toLowerCase(),
			vaultAddress: vault.toLowerCase(),
			routerAddress: router.toLowerCase(),
			taxSplitterAddress: taxSplitter.toLowerCase(),
			creator: creator.toLowerCase(),
			tier,
			presaleCap,
			v2BuyBnb,
			vestingEnabled: vestingEnabled ? 1 : 0,
			state: "open",
			closeTimestamp: BigInt(Math.floor(event.blockTimestamp.getTime() / 1_000)),
			createTxHash: event.txHash,
			createBlockNumber: event.blockNumber,
		})
		.onConflictDoUpdate({
			target: schema.agentLaunches.tokenAddress,
			set: {
				vaultAddress: vault.toLowerCase(),
				routerAddress: router.toLowerCase(),
				taxSplitterAddress: taxSplitter.toLowerCase(),
				creator: creator.toLowerCase(),
				tier,
				presaleCap,
				v2BuyBnb,
				vestingEnabled: vestingEnabled ? 1 : 0,
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
			.where(eq(schema.agentLaunches.tokenAddress, token.toLowerCase()))
			.limit(1);
		if (!row) {
			throw new Error(`agent_launches row not found after upsert for token ${token}`);
		}
		return { launchId: row.id };
	}

	runtime.logger.info(
		{
			launchId,
			token: token.toLowerCase(),
			vault: vault.toLowerCase(),
			router: router.toLowerCase(),
			taxSplitter: taxSplitter.toLowerCase(),
			tier,
			block: event.blockNumber.toString(),
			tx: event.txHash,
		},
		"LaunchCreated indexed",
	);

	return { launchId };
}
