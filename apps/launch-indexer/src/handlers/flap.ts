import { schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

import type { FlapLaunchedToDexEvent, PortalTokenCreatedEvent } from "../lib/events.js";
import { bumpCounter } from "../lib/metrics.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export async function handlePortalTokenCreated(
	runtime: LaunchIndexerRuntime,
	event: PortalTokenCreatedEvent,
): Promise<{ launchId: string } | null> {
	const token = event.data.token.toLowerCase();
	const [launch] = await runtime.db
		.select({ id: schema.agentLaunches.id, predictedTokenAddress: schema.agentLaunches.predictedTokenAddress })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.predictedTokenAddress, token))
		.limit(1);
	if (!launch) {
		// gap #20: portal emitted TokenCreated but we have no row with that
		// predicted address. either salt mining drifted, the portal upgraded
		// init-code under us, or this is an unrelated TokenCreated emitted
		// from the same portal. router-level `PredictedAddressMismatch`
		// already protects funds; here we just need observability.
		bumpCounter(runtime.logger, "indexer_portal_token_created_unmatched_total", 1, {
			token,
			creator: event.data.creator,
			nonce: event.data.nonce,
		});
		runtime.logger.warn(
			{
				token,
				creator: event.data.creator,
				nonce: event.data.nonce,
				name: event.data.name,
				symbol: event.data.symbol,
				txHash: event.txHash,
				blockNumber: event.blockNumber.toString(),
			},
			"portal TokenCreated has no matching predicted address (gap #20)",
		);
		return null;
	}

	await runtime.db
		.update(schema.agentLaunches)
		.set({
			flapTokenAddress: token,
			state: "launched",
			launchTimestamp: BigInt(event.data.ts),
			bundleStatus: "confirmed",
			updatedAt: new Date(),
		})
		.where(eq(schema.agentLaunches.id, launch.id));
	return { launchId: launch.id };
}

export async function handleFlapLaunchedToDex(
	runtime: LaunchIndexerRuntime,
	event: FlapLaunchedToDexEvent,
): Promise<{ launchId: string } | null> {
	const token = event.data.token.toLowerCase();
	const [launch] = await runtime.db
		.select({ id: schema.agentLaunches.id })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.flapTokenAddress, token))
		.limit(1);
	if (!launch) {
		bumpCounter(runtime.logger, "indexer_flap_launched_to_dex_unmatched_total", 1, {
			token,
			pair: event.data.pair,
		});
		runtime.logger.warn(
			{
				token,
				pair: event.data.pair,
				txHash: event.txHash,
				blockNumber: event.blockNumber.toString(),
			},
			"FlapLaunchedToDex has no matching launch row",
		);
		return null;
	}

	await runtime.db
		.update(schema.agentLaunches)
		.set({
			v2Pair: event.data.pair.toLowerCase(),
			curveFillBnb: event.data.quoteAmt,
			state: "launched",
			updatedAt: new Date(),
		})
		.where(eq(schema.agentLaunches.id, launch.id));
	return { launchId: launch.id };
}
