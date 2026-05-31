import { schema } from "@waifufun/db";
import type { AgentProvisioningJob } from "@waifufun/queue/jobs";
import { and, eq, sql } from "drizzle-orm";

import type { TokenCreateEvent } from "../lib/fourmeme-events.js";
import { getFourMemeEventId } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { emitAgentEvent } from "./agent-event-bus.js";
import { isKnownAgentWallet, lookupAgentIdByWallet, upsertAgentWalletToken } from "./fourmeme-filters.js";
import type { PortalEventHandlerResult } from "./index.js";

/**
 * Four.meme `TokenCreate` is emitted for every TokenManager2 launch. Only
 * persist waifu.fun launches whose creator is one of our agent wallets.
 */
export async function handleTokenCreateEvent(
	runtime: IndexerRuntime,
	event: TokenCreateEvent,
): Promise<PortalEventHandlerResult> {
	const eventId = getFourMemeEventId(event);
	const isOurs = await isKnownAgentWallet(runtime, event.data.creator);

	if (!isOurs) {
		runtime.logger.debug(
			{
				creator: event.data.creator,
				token: event.data.token,
				requestId: event.data.requestId,
				txHash: event.txHash,
			},
			"TokenCreate: creator not in agent_wallets, skipping",
		);
		return { handled: true, enqueuedJobs: [] };
	}

	runtime.logger.info(
		{
			eventName: event.eventName,
			token: event.data.token,
			creator: event.data.creator,
			name: event.data.name,
			symbol: event.data.symbol,
			totalSupply: event.data.totalSupply,
			requestId: event.data.requestId,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling four.meme TokenCreate for waifu agent",
	);

	const agentId = await lookupAgentIdByWallet(runtime, event.data.creator);
	let confirmedLaunchId: string | null = null;

	await runtime.db.transaction(async (tx) => {
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "TokenCreate",
				portalAddress: event.contractAddress,
				tokenAddress: event.data.token,
				actorAddress: event.data.creator,
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
			.insert(schema.tokens)
			.values({
				chainId: event.chainId,
				contractAddress: event.data.token,
				name: event.data.name,
				ticker: event.data.symbol,
				creatorAddress: event.data.creator,
				launchPlatform: "four.meme",
				portalAddress: event.contractAddress,
				decimals: 18,
				totalSupply: event.data.totalSupply,
				taxRate: 0,
				isTaxToken: false,
				status: "active",
				volume24h: "0",
				holderCount: 0,
				createdAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.onConflictDoUpdate({
				target: [schema.tokens.chainId, schema.tokens.contractAddress],
				set: {
					name: event.data.name,
					ticker: event.data.symbol,
					creatorAddress: event.data.creator,
					totalSupply: event.data.totalSupply,
					launchPlatform: "four.meme",
					portalAddress: event.contractAddress,
					updatedAt: event.blockTimestamp,
				},
			});

		const [confirmedLaunch] = await tx
			.update(schema.launches)
			.set({
				status: "live",
				tokenAddress: event.data.token,
				confirmedAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.where(
				and(
					eq(schema.launches.chainId, event.chainId),
					sql`lower(${schema.launches.tokenName}) = lower(${event.data.name})`,
					sql`lower(${schema.launches.tokenTicker}) = lower(${event.data.symbol})`,
				),
			)
			.returning({ id: schema.launches.id });
		confirmedLaunchId = confirmedLaunch?.id ?? null;

		if (agentId) {
			await tx
				.update(schema.agentPersonas)
				.set({ tokenAddress: event.data.token.toLowerCase(), updatedAt: event.blockTimestamp })
				.where(eq(schema.agentPersonas.agentId, agentId));
		}

		await tx
			.insert(schema.curveState)
			.values({
				agentToken: event.data.token,
				waifuBonded: "0",
				curveLimit: "0",
				offers: "0",
				funds: "0",
				lastPrice: null,
				status: "ACTIVE",
				isGraduated: false,
				pancakeswapPair: null,
				graduatedAt: null,
				updatedAt: event.blockTimestamp,
			})
			.onConflictDoNothing();
	});

	await upsertAgentWalletToken(runtime, event.data.creator, event.data.token, event.blockTimestamp);

	if (process.env.INDEXER_DISABLE_QUEUE_JOBS !== "1") {
		const { addAgentProvisioningJob, addCacheWarmJob, addNotificationJob } = await import("@waifufun/queue");

		await addCacheWarmJob(
			{
				target: "token",
				tokenAddress: event.data.token,
				reason: "fourmeme-token-create",
			},
			{ jobId: `indexer-${eventId}-cache-warm-${event.data.token}` },
		);

		// Provision the containerized ElizaOS cloud agent as soon as the token
		// is confirmed live on the bonding curve. Previously the cloud agent was
		// only spun up at DEX graduation (launched-to-dex / liquidity-added),
		// which meant a freshly-launched agent had a token but no running runtime.
		// The agent-provisioning worker is idempotent (it skips personas that
		// already carry an eliza_cloud_agent_id), so the later graduation enqueue
		// is a no-op once this one has provisioned.
		if (agentId && confirmedLaunchId) {
			await addAgentProvisioningJob(
				buildTokenCreateProvisioningJob(agentId, event),
				{ jobId: `indexer-${eventId}-agent-provisioning-${agentId}` },
			);
		}

		await addNotificationJob(
			{
				type: "generic",
				audience: "public",
				channel: "internal",
				referenceId: event.data.token,
				payload: {
					kind: "fourmeme-token-create",
					tokenAddress: event.data.token,
					creatorAddress: event.data.creator,
					name: event.data.name,
					symbol: event.data.symbol,
					totalSupply: event.data.totalSupply,
					requestId: event.data.requestId,
				},
			},
			{ jobId: `indexer-${eventId}-notification-token-create` },
		);
	}

	runtime.webhooks.emit({
		event: "token.created",
		tokenAddress: event.data.token,
		chainId: event.chainId,
		timestamp: event.blockTimestamp,
		data: {
			tokenAddress: event.data.token,
			creatorAddress: event.data.creator,
			name: event.data.name,
			symbol: event.data.symbol,
			totalSupply: event.data.totalSupply,
			requestId: event.data.requestId,
			txHash: event.txHash,
			blockNumber: event.blockNumber.toString(),
			launchPlatform: "four.meme",
			taxRate: 0,
			isTaxToken: false,
		},
	});

	if (agentId && confirmedLaunchId) {
		await emitAgentEvent(runtime, {
			agentId,
			tokenAddress: event.data.token,
			type: "launch.confirmed",
			payload: {
				launchId: confirmedLaunchId,
				tokenAddress: event.data.token,
				txHash: event.txHash,
				blockNumber: event.blockNumber.toString(),
			},
		});
	}

	await emitAgentEvent(runtime, {
		agentId,
		tokenAddress: event.data.token,
		type: "agent.created",
		payload: {
			tokenAddress: event.data.token,
			creator: event.data.creator,
			name: event.data.name,
			symbol: event.data.symbol,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
	});

	const enqueuedJobs = ["cache-warm", "notification"];
	if (agentId && confirmedLaunchId && process.env.INDEXER_DISABLE_QUEUE_JOBS !== "1") {
		enqueuedJobs.push("agent-provisioning");
	}
	return { handled: true, enqueuedJobs };
}

/**
 * Build the cloud-agent provisioning job for a freshly-launched four.meme
 * token. Mirrors the DEX-graduation payload shape (see
 * `buildLaunchedToDexProvisioningJob`) but is sourced from the create event so
 * the runtime container boots at launch time rather than at graduation.
 */
export function buildTokenCreateProvisioningJob(agentId: string, event: TokenCreateEvent): AgentProvisioningJob {
	return {
		agentId,
		source: "agent.launched",
		data: {
			tokenAddress: event.data.token,
			tokenContractAddress: event.data.token,
			chain: "bsc",
			chainId: event.chainId,
			tokenName: event.data.name,
			tokenTicker: event.data.symbol,
			launchType: "native",
			txHash: event.txHash,
			blockNumber: event.blockNumber.toString(),
		},
	};
}
