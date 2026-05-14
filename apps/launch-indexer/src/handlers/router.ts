/**
 * BundleRouter event handlers (wave H).
 *
 * BundleExecuted closes the V2 pair side of the launch flow: we capture the
 * V2 pair, opening market cap, and bundle stats onto the canonical
 * agent_launches row.
 *
 * BundleFailed marks the launch's bundleStatus as failed; if the bundle bot
 * subsequently triggers enableRefundBundleFailed on the vault, the vault
 * RefundEnabled handler will flip state to "failed" too.
 */

import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { BundleExecutedEvent, BundleFailedEvent } from "../lib/events.js";
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
			flapTokenAddress: event.data.token.toLowerCase(),
			v2Pair: event.data.pool.toLowerCase(),
			openMcBnb: event.data.openMcBnb,
			curveFillBnb: event.data.quoteAmt,
			tokensFromV2: event.data.tokensReceived,
			tokensBurned: event.data.tokensBurned,
			bundleTxHash: event.txHash,
			bundleStatus: "confirmed",
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			token: event.data.token,
			pool: event.data.pool,
			openMcBnb: event.data.openMcBnb,
			quoteAmt: event.data.quoteAmt,
			tokensReceived: event.data.tokensReceived,
			tokensBurned: event.data.tokensBurned,
			tokensToTreasury: event.data.tokensToTreasury,
			tokensToVault: event.data.tokensToVault,
			tipPaid: event.data.tipPaid,
			v2BuyBnb: event.data.v2BuyBnb,
			tx: event.txHash,
		},
		"BundleExecuted indexed",
	);
}

export async function handleBundleFailed(
	runtime: LaunchIndexerRuntime,
	event: BundleFailedEvent,
	ctx: RouterHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			bundleStatus: "failed_retry",
			bundleFailureReason: event.data.reason,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.warn(
		{
			launchId: ctx.launchId,
			reason: event.data.reason,
			tx: event.txHash,
		},
		"BundleFailed indexed",
	);
}
