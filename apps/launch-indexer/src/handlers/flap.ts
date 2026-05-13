import { schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

import type { FlapLaunchedToDexEvent, PortalTokenCreatedEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export async function handlePortalTokenCreated(
	runtime: LaunchIndexerRuntime,
	event: PortalTokenCreatedEvent,
): Promise<{ launchId: string } | null> {
	const token = event.data.token.toLowerCase();
	const [launch] = await runtime.db
		.select({ id: schema.agentLaunches.id })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.predictedTokenAddress, token))
		.limit(1);
	if (!launch) return null;

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
	if (!launch) return null;

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
