/**
 * Decoded launch event envelopes used by the W44 indexer.
 *
 * `bigint` values from the chain are normalized to decimal strings so that
 * downstream persistence (`numeric` / `text` columns) doesn't have to
 * re-encode them.
 */

import type { Address } from "viem";

export type LaunchEventName =
	| "LaunchCreated"
	| "Deposited"
	| "Withdrawn"
	| "Closed"
	| "Launched"
	| "Claimed"
	| "BundleExecuted";

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
		creator: Address;
		token: Address;
		vault: Address;
		router: Address;
		taxSplitter: Address;
		tier: number;
		presaleCap: string;
		v2BuyBnb: string;
		vestingEnabled: boolean;
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

export type LaunchedEvent = LaunchEventEnvelope<
	"Launched",
	{
		token: Address;
		totalBnb: string;
		launchTimestamp: string;
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
		flapToken: Address;
		v2Pair: Address;
		curveFillBnb: string;
		v2BuyBnb: string;
		tokensFromV2: string;
		tokensBurned: string;
		tokensToTax: string;
		openMcBnb: string;
	}
>;

export type LaunchEvent =
	| LaunchCreatedEvent
	| DepositedEvent
	| WithdrawnEvent
	| ClosedEvent
	| LaunchedEvent
	| ClaimedEvent
	| BundleExecutedEvent;

export type LaunchVaultEvent = DepositedEvent | WithdrawnEvent | ClosedEvent | LaunchedEvent | ClaimedEvent;
export type BundleRouterEvent = BundleExecutedEvent;
