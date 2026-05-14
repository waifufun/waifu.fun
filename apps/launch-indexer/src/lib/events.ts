/**
 * Decoded launch event envelopes used by the wave H/I indexer.
 *
 * `bigint` values from the chain are normalized to decimal strings so that
 * downstream persistence (`numeric` / `text` columns) doesn't have to
 * re-encode them.
 *
 * Event names match the on-chain Solidity events 1:1 (LaunchExecuted, not
 * Launched; RefundEnabled, not RefundsEnabled; etc.).
 */

import type { Address } from "viem";

export type LaunchEventName =
	| "LaunchCreated"
	| "RouterSet"
	| "Deposited"
	| "Withdrawn"
	| "Closed"
	| "LaunchExecuted"
	| "Distributed"
	| "RefundEnabled"
	| "Refunded"
	| "Claimed"
	| "BundleExecuted"
	| "BundleFailed"
	| "TokenCreated"
	| "LaunchedToDEX";

export interface LaunchEventEnvelope<TEventName extends LaunchEventName, TData> {
	eventName: TEventName;
	chainId: number;
	contractAddress: Address;
	blockNumber: bigint;
	txHash: `0x${string}`;
	logIndex: number;
	blockTimestamp: Date;
	data: TData;
}

export type LaunchCreatedEvent = LaunchEventEnvelope<
	"LaunchCreated",
	{
		launchId: `0x${string}`;
		creator: Address;
		predictedToken: Address;
		vault: Address;
		router: Address;
		treasuryLp: Address;
		tier: number;
		presaleCap: string;
		v2BuyBnb: string;
		closeTimestamp: string;
	}
>;

export type RouterSetEvent = LaunchEventEnvelope<
	"RouterSet",
	{
		router: Address;
	}
>;

export type DepositedEvent = LaunchEventEnvelope<
	"Deposited",
	{
		user: Address;
		amount: string;
		newTotal: string;
	}
>;

export type WithdrawnEvent = LaunchEventEnvelope<
	"Withdrawn",
	{
		user: Address;
		amount: string;
		penalty: string;
		refund: string;
	}
>;

export type ClosedEvent = LaunchEventEnvelope<
	"Closed",
	{
		by: Address;
		totalDeposited: string;
		bonusPool: string;
	}
>;

export type LaunchExecutedEvent = LaunchEventEnvelope<
	"LaunchExecuted",
	{
		token: Address;
		totalBnb: string;
		timestamp: string;
	}
>;

export type DistributedEvent = LaunchEventEnvelope<
	"Distributed",
	{
		token: Address;
		presalerShare: string;
	}
>;

export type RefundEnabledEvent = LaunchEventEnvelope<
	"RefundEnabled",
	{
		by: Address;
		reason: string;
	}
>;

export type RefundedEvent = LaunchEventEnvelope<
	"Refunded",
	{
		user: Address;
		principal: string;
		bonus: string;
		refundAmount: string;
	}
>;

export type ClaimedEvent = LaunchEventEnvelope<
	"Claimed",
	{
		user: Address;
		amount: string;
		totalClaimed: string;
	}
>;

export type BundleExecutedEvent = LaunchEventEnvelope<
	"BundleExecuted",
	{
		token: Address;
		pool: Address;
		quoteAmt: string;
		v2BuyBnb: string;
		tokensReceived: string;
		tokensBurned: string;
		tokensToTreasury: string;
		tokensToVault: string;
		tipPaid: string;
		openMcBnb: string;
	}
>;

export type BundleFailedEvent = LaunchEventEnvelope<
	"BundleFailed",
	{
		reason: string;
	}
>;

export type PortalTokenCreatedEvent = LaunchEventEnvelope<
	"TokenCreated",
	{
		ts: string;
		creator: Address;
		nonce: string;
		token: Address;
		name: string;
		symbol: string;
		meta: string;
	}
>;

export type FlapLaunchedToDexEvent = LaunchEventEnvelope<
	"LaunchedToDEX",
	{
		token: Address;
		pair: Address;
		quoteAmt: string;
	}
>;

export type LaunchEvent =
	| LaunchCreatedEvent
	| RouterSetEvent
	| DepositedEvent
	| WithdrawnEvent
	| ClosedEvent
	| LaunchExecutedEvent
	| DistributedEvent
	| RefundEnabledEvent
	| RefundedEvent
	| ClaimedEvent
	| BundleExecutedEvent
	| BundleFailedEvent
	| PortalTokenCreatedEvent
	| FlapLaunchedToDexEvent;

export type LaunchVaultEvent =
	| RouterSetEvent
	| DepositedEvent
	| WithdrawnEvent
	| ClosedEvent
	| LaunchExecutedEvent
	| DistributedEvent
	| RefundEnabledEvent
	| RefundedEvent
	| ClaimedEvent;

export type BundleRouterEvent = BundleExecutedEvent | BundleFailedEvent;
