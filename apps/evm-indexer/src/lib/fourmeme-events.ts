import type { Address } from "./address.js";

// ---------------------------------------------------------------------------
// Four.Meme event names
// ---------------------------------------------------------------------------

export type FourMemeEventName =
	| "TokenCreate"
	| "TokenPurchase"
	| "TokenSale"
	| "LiquidityAdded"
	| "TradeStop"
	| "NftAdded"
	| "NftRemoved"
	| "Registered";

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface FourMemeEventEnvelope<TEventName extends FourMemeEventName, TData> {
	eventName: TEventName;
	chainId: number;
	contractAddress: Address;
	blockNumber: bigint;
	txHash: `0x${string}`;
	logIndex: number;
	blockTimestamp: Date;
	data: TData;
}

// ---------------------------------------------------------------------------
// Concrete event types
// ---------------------------------------------------------------------------

export type TokenCreateEvent = FourMemeEventEnvelope<
	"TokenCreate",
	{
		creator: Address;
		token: Address;
		requestId: string;
		name: string;
		symbol: string;
		totalSupply: string;
		launchTime: string;
		launchFee: string;
	}
>;

export type TokenPurchaseEvent = FourMemeEventEnvelope<
	"TokenPurchase",
	{
		token: Address;
		account: Address;
		price: string;
		amount: string;
		cost: string;
		fee: string;
		offers: string;
		funds: string;
	}
>;

export type TokenSaleEvent = FourMemeEventEnvelope<
	"TokenSale",
	{
		token: Address;
		account: Address;
		price: string;
		amount: string;
		cost: string;
		fee: string;
		offers: string;
		funds: string;
	}
>;

export type LiquidityAddedEvent = FourMemeEventEnvelope<
	"LiquidityAdded",
	{
		base: Address;
		offers: string;
		quote: Address;
		funds: string;
	}
>;

export type TradeStopEvent = FourMemeEventEnvelope<
	"TradeStop",
	{
		token: Address;
	}
>;

export type NftAddedEvent = FourMemeEventEnvelope<
	"NftAdded",
	{
		nft: Address;
	}
>;

export type NftRemovedEvent = FourMemeEventEnvelope<
	"NftRemoved",
	{
		nft: Address;
	}
>;

export type Erc8004RegisteredEvent = FourMemeEventEnvelope<
	"Registered",
	{
		agentId: string;
		agentURI: string;
		owner: Address;
	}
>;

export type FourMemeEvent =
	| TokenCreateEvent
	| TokenPurchaseEvent
	| TokenSaleEvent
	| LiquidityAddedEvent
	| TradeStopEvent
	| NftAddedEvent
	| NftRemovedEvent
	| Erc8004RegisteredEvent;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getFourMemeEventCursorPosition(event: FourMemeEvent): {
	blockNumber: bigint;
	logIndex: number;
} {
	return {
		blockNumber: event.blockNumber,
		logIndex: event.logIndex,
	};
}

export function getFourMemeEventId(event: FourMemeEvent): string {
	return `fourmeme:${event.txHash}-${event.logIndex}`;
}
