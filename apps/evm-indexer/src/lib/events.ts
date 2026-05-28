import type { Address } from "./address.js";

export type PortalEventName =
	| "TokenCreated"
	| "TokenBought"
	| "TokenSold"
	| "FlapTokenProgressChanged"
	| "LaunchedToDEX";

// Normalized event envelope used by the indexer runtime before persistence.
// Naming intentionally mirrors packages/db (`event_name`, `data`) and Flap event names.
export interface PortalEventEnvelope<TEventName extends PortalEventName, TData> {
	eventName: TEventName;
	chainId: number;
	portalAddress: Address;
	blockNumber: bigint;
	txHash: `0x${string}`;
	logIndex: number;
	blockTimestamp: Date;
	data: TData;
}

export type TokenCreatedEvent = PortalEventEnvelope<
	"TokenCreated",
	{
		tokenAddress: Address;
		creatorAddress: Address;
		name: string;
		symbol: string;
		metadataUri?: string;
		taxRate?: number;
	}
>;

export type TokenBoughtEvent = PortalEventEnvelope<
	"TokenBought",
	{
		tokenAddress: Address;
		buyerAddress: Address;
		quoteAmount: string;
		tokenAmount: string;
		postPrice?: string;
	}
>;

export type TokenSoldEvent = PortalEventEnvelope<
	"TokenSold",
	{
		tokenAddress: Address;
		sellerAddress: Address;
		quoteAmount: string;
		tokenAmount: string;
		postPrice?: string;
	}
>;

export type ProgressChangedEvent = PortalEventEnvelope<
	"FlapTokenProgressChanged",
	{
		tokenAddress: Address;
		progressBps: number;
		reserveAmount?: string;
	}
>;

export type LaunchedToDexEvent = PortalEventEnvelope<
	"LaunchedToDEX",
	{
		tokenAddress: Address;
		poolAddress: Address;
		dexName?: string;
	}
>;

export type PortalEvent =
	| TokenCreatedEvent
	| TokenBoughtEvent
	| TokenSoldEvent
	| ProgressChangedEvent
	| LaunchedToDexEvent;

export function getPortalEventCursorPosition(event: PortalEvent): {
	blockNumber: bigint;
	logIndex: number;
} {
	return {
		blockNumber: event.blockNumber,
		logIndex: event.logIndex,
	};
}

export function getPortalEventId(event: PortalEvent): string {
	return `${event.txHash}-${event.logIndex}`;
}
