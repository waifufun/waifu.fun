/**
 * Shared types for the W46 notifications service.
 *
 * `LaunchSnapshot` is a normalized projection of `agent_launches` columns we
 * actually need. We keep it narrow on purpose so the formatter + dispatcher
 * can be unit-tested without dragging the entire DB schema in.
 */

import type { LaunchNotificationChannel, LaunchNotificationEventType, LaunchNotificationStatus } from "@waifufun/db";

export type EventType = LaunchNotificationEventType;
export type Channel = LaunchNotificationChannel;
export type DeliveryStatus = LaunchNotificationStatus;

export interface LaunchSnapshot {
	id: string;
	tokenAddress: string;
	vaultAddress: string;
	creator: string;
	tier: number;
	state: "open" | "closed" | "launched" | "failed";
	presaleCap: bigint;
	totalDeposited: bigint;
	depositorCount: number;
	closeTimestamp: bigint;
	launchTimestamp: bigint | null;
	v2Pair: string | null;
	tokenName: string | null;
	tokenTicker: string | null;
	tokenImageUrl: string | null;
	createdAt: Date;
}

export interface SubscriptionRecord {
	launchId: string;
	channel: Channel;
	target: string;
	botToken: string | null;
	eventFilter: ReadonlyArray<EventType> | null;
}

export interface PendingEvent {
	launch: LaunchSnapshot;
	eventType: EventType;
	/** Detail derived from the launch state at detection time. Carried into the message formatter. */
	detail: EventDetail;
}

export type EventDetail =
	| { kind: "round_opened" }
	| { kind: "cap_hit"; capBps: number }
	| { kind: "launched" }
	| { kind: "tranche_deployed"; trancheIndex: number; trancheBps: number }
	| { kind: "summary_24h" };

export interface FormattedMessage {
	title: string;
	description: string;
	url: string | null;
	fields: ReadonlyArray<{ name: string; value: string }>;
}

export interface DeliveryResult {
	status: DeliveryStatus;
	statusCode: string | null;
	errorMessage: string | null;
}

export interface NotificationLogInput {
	launchId: string;
	eventType: EventType;
	channel: Channel;
	dedupeKey: string;
	webhookUrl: string | null;
	status: DeliveryStatus;
	statusCode: string | null;
	errorMessage: string | null;
	payload: Record<string, unknown>;
}

export interface AlreadySentLookup {
	has(launchId: string, eventType: EventType, channel: Channel, dedupeKey: string): boolean;
	hasNoSubscriberSentinel(launchId: string, eventType: EventType, dedupeKey: string): boolean;
}

export const NO_SUBSCRIBERS_DEDUPE_PREFIX = "__no_subscribers__:";

export function noSubscribersDedupeKey(dedupeKey: string): string {
	return `${NO_SUBSCRIBERS_DEDUPE_PREFIX}${dedupeKey}`;
}

export function normalizeNoSubscribersDedupeKey(dedupeKey: string): string {
	return dedupeKey.startsWith(NO_SUBSCRIBERS_DEDUPE_PREFIX)
		? dedupeKey.slice(NO_SUBSCRIBERS_DEDUPE_PREFIX.length)
		: dedupeKey;
}
