import type { Address } from "./address.js";

// ---------------------------------------------------------------------------
// VeWaifuStaking event names
// ---------------------------------------------------------------------------

export type StakingEventName = "Staked" | "Withdrawn" | "RewardClaimed" | "RewardNotified";

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface StakingEventEnvelope<TEventName extends StakingEventName, TData> {
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

export type StakedEvent = StakingEventEnvelope<
	"Staked",
	{
		user: Address;
		amount: string;
	}
>;

export type WithdrawnEvent = StakingEventEnvelope<
	"Withdrawn",
	{
		user: Address;
		amount: string;
	}
>;

export type RewardClaimedEvent = StakingEventEnvelope<
	"RewardClaimed",
	{
		user: Address;
		reward: string;
	}
>;

export type RewardNotifiedEvent = StakingEventEnvelope<
	"RewardNotified",
	{
		reward: string;
	}
>;

export type StakingEvent = StakedEvent | WithdrawnEvent | RewardClaimedEvent | RewardNotifiedEvent;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStakingEventCursorPosition(event: StakingEvent): {
	blockNumber: bigint;
	logIndex: number;
} {
	return {
		blockNumber: event.blockNumber,
		logIndex: event.logIndex,
	};
}

export function getStakingEventId(event: StakingEvent): string {
	return `staking:${event.txHash}-${event.logIndex}`;
}
