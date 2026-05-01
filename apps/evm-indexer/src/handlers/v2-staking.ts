import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { IndexerRuntime } from "../lib/runtime.js";
import type {
	RewardClaimedEvent,
	RewardNotifiedEvent,
	StakedEvent,
	StakingEvent,
	WithdrawnEvent,
} from "../lib/staking-events.js";
import type { PortalEventHandlerResult } from "./index.js";

export async function processStakingEvent(
	runtime: IndexerRuntime,
	event: StakingEvent,
): Promise<PortalEventHandlerResult> {
	switch (event.eventName) {
		case "Staked":
			return handleStakedEvent(runtime, event);
		case "Withdrawn":
			return handleWithdrawnEvent(runtime, event);
		case "RewardClaimed":
			return handleRewardClaimedEvent(runtime, event);
		case "RewardNotified":
			return handleRewardNotifiedEvent(runtime, event);
		default: {
			const _exhaustive: never = event;
			return _exhaustive;
		}
	}
}

export async function handleStakedEvent(
	runtime: IndexerRuntime,
	event: StakedEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			user: event.data.user,
			amount: event.data.amount,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling VeWaifuStaking Staked event",
	);

	await runtime.db.transaction(async (tx) => {
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "Staked",
				portalAddress: event.contractAddress,
				tokenAddress: null,
				actorAddress: event.data.user,
				payload: event.data as unknown as Record<string, unknown>,
				blockTimestamp: event.blockTimestamp,
				processed: true,
			})
			.onConflictDoUpdate({
				target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
				set: {
					processed: true,
					processError: null,
				},
			});

		await tx
			.insert(schema.stakingPositions)
			.values({
				walletAddress: event.data.user,
				stakedAmount: event.data.amount,
				earnedRewards: "0",
				lastUpdatedAt: event.blockTimestamp,
			})
			.onConflictDoUpdate({
				target: [schema.stakingPositions.walletAddress],
				set: {
					stakedAmount: sql`${schema.stakingPositions.stakedAmount}::numeric + ${event.data.amount}::numeric`,
					lastUpdatedAt: event.blockTimestamp,
				},
			});
	});

	return { handled: true, enqueuedJobs: [] };
}

export async function handleWithdrawnEvent(
	runtime: IndexerRuntime,
	event: WithdrawnEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			user: event.data.user,
			amount: event.data.amount,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling VeWaifuStaking Withdrawn event",
	);

	await runtime.db.transaction(async (tx) => {
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "Withdrawn",
				portalAddress: event.contractAddress,
				tokenAddress: null,
				actorAddress: event.data.user,
				payload: event.data as unknown as Record<string, unknown>,
				blockTimestamp: event.blockTimestamp,
				processed: true,
			})
			.onConflictDoUpdate({
				target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
				set: {
					processed: true,
					processError: null,
				},
			});

		await tx
			.update(schema.stakingPositions)
			.set({
				stakedAmount: sql`GREATEST(${schema.stakingPositions.stakedAmount}::numeric - ${event.data.amount}::numeric, 0)`,
				lastUpdatedAt: event.blockTimestamp,
			})
			.where(eq(schema.stakingPositions.walletAddress, event.data.user));
	});

	return { handled: true, enqueuedJobs: [] };
}

export async function handleRewardClaimedEvent(
	runtime: IndexerRuntime,
	event: RewardClaimedEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			user: event.data.user,
			reward: event.data.reward,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling VeWaifuStaking RewardClaimed event",
	);

	await runtime.db.transaction(async (tx) => {
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "RewardClaimed",
				portalAddress: event.contractAddress,
				tokenAddress: null,
				actorAddress: event.data.user,
				payload: event.data as unknown as Record<string, unknown>,
				blockTimestamp: event.blockTimestamp,
				processed: true,
			})
			.onConflictDoUpdate({
				target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
				set: {
					processed: true,
					processError: null,
				},
			});

		await tx
			.insert(schema.stakingPositions)
			.values({
				walletAddress: event.data.user,
				stakedAmount: "0",
				earnedRewards: event.data.reward,
				lastUpdatedAt: event.blockTimestamp,
			})
			.onConflictDoUpdate({
				target: [schema.stakingPositions.walletAddress],
				set: {
					earnedRewards: sql`${schema.stakingPositions.earnedRewards}::numeric + ${event.data.reward}::numeric`,
					lastUpdatedAt: event.blockTimestamp,
				},
			});
	});

	return { handled: true, enqueuedJobs: [] };
}

export async function handleRewardNotifiedEvent(
	runtime: IndexerRuntime,
	event: RewardNotifiedEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			reward: event.data.reward,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling VeWaifuStaking RewardNotified event (informational)",
	);

	// Audit log only — no per-user state change
	await runtime.db
		.insert(schema.events)
		.values({
			chainId: event.chainId,
			blockNumber: event.blockNumber,
			txHash: event.txHash,
			logIndex: event.logIndex,
			eventType: "RewardNotified",
			portalAddress: event.contractAddress,
			tokenAddress: null,
			actorAddress: null,
			payload: event.data as unknown as Record<string, unknown>,
			blockTimestamp: event.blockTimestamp,
			processed: true,
		})
		.onConflictDoUpdate({
			target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
			set: {
				processed: true,
				processError: null,
			},
		});

	return { handled: true, enqueuedJobs: [] };
}
