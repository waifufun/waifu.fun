/**
 * BundleRouter event handler. BundleExecuted closes the V2 pair side of the
 * launch flow: we capture the V2 pair, opening market cap, and bundle stats
 * onto the canonical agent_launches row.
 */

import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { BundleExecutedEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export interface RouterHandlerContext {
	launchId: string;
}

export async function handleBundleExecuted(
	runtime: LaunchIndexerRuntime,
	event: BundleExecutedEvent,
	ctx: RouterHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			state: "launched",
			v2Pair: event.data.v2Pair.toLowerCase(),
			openMcBnb: event.data.openMcBnb,
			curveFillBnb: event.data.curveFillBnb,
			tokensFromV2: event.data.tokensFromV2,
			tokensBurned: event.data.tokensBurned,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			flapToken: event.data.flapToken,
			v2Pair: event.data.v2Pair,
			openMcBnb: event.data.openMcBnb,
			curveFillBnb: event.data.curveFillBnb,
			tokensFromV2: event.data.tokensFromV2,
			tokensBurned: event.data.tokensBurned,
			tokensToTax: event.data.tokensToTax,
			v2BuyBnb: event.data.v2BuyBnb,
			tx: event.txHash,
		},
		"BundleExecuted indexed",
	);
}
