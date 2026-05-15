/**
 * Thin DB-facing helpers for the W46 notifier. Hand-rolled (no per-table
 * query helpers) because each call is one-shot and we want the surface area
 * narrow enough to swap for an in-memory fake in tests.
 */

import { type Database, schema } from "@waifufun/db";
import { inArray } from "drizzle-orm";

import type {
	AlreadySentLookup,
	Channel,
	EventType,
	LaunchSnapshot,
	NotificationLogInput,
	SubscriptionRecord,
} from "./types.js";

export interface NotificationsRepository {
	listLaunches(limit: number): Promise<LaunchSnapshot[]>;
	listSubscriptions(launchIds: string[]): Promise<SubscriptionRecord[]>;
	loadAlreadySent(launchIds: string[]): Promise<AlreadySentLookup>;
	recordSend(input: NotificationLogInput): Promise<void>;
}

interface AgentLaunchRowSelect {
	id: string;
	tokenAddress: string;
	vaultAddress: string;
	creator: string;
	tier: number;
	state: string;
	presaleCap: string;
	totalDeposited: string;
	depositorCount: number;
	closeTimestamp: bigint;
	launchTimestamp: bigint | null;
	v2Pair: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
	if (!metadata) return null;
	const value = metadata[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function rowToSnapshot(row: AgentLaunchRowSelect): LaunchSnapshot {
	const md = row.metadata ?? {};
	return {
		id: row.id,
		tokenAddress: row.tokenAddress,
		vaultAddress: row.vaultAddress,
		creator: row.creator,
		tier: row.tier,
		state: row.state as LaunchSnapshot["state"],
		presaleCap: BigInt(row.presaleCap),
		totalDeposited: BigInt(row.totalDeposited),
		depositorCount: row.depositorCount,
		closeTimestamp: row.closeTimestamp,
		launchTimestamp: row.launchTimestamp,
		v2Pair: row.v2Pair,
		tokenName: readMetadataString(md, "name"),
		tokenTicker: readMetadataString(md, "ticker") ?? readMetadataString(md, "symbol"),
		tokenImageUrl: readMetadataString(md, "image") ?? readMetadataString(md, "imageUrl"),
		createdAt: row.createdAt,
	};
}

class DrizzleSet implements AlreadySentLookup {
	constructor(private readonly keys: Set<string>) {}
	has(launchId: string, eventType: EventType, channel: Channel, dedupeKey: string): boolean {
		return this.keys.has(`${launchId}:${eventType}:${channel}:${dedupeKey}`);
	}
}

export class DrizzleNotificationsRepository implements NotificationsRepository {
	constructor(private readonly db: Database) {}

	async listLaunches(limit: number): Promise<LaunchSnapshot[]> {
		const rows = await this.db
			.select({
				id: schema.agentLaunches.id,
				tokenAddress: schema.agentLaunches.tokenAddress,
				vaultAddress: schema.agentLaunches.vaultAddress,
				creator: schema.agentLaunches.creator,
				tier: schema.agentLaunches.tier,
				state: schema.agentLaunches.state,
				presaleCap: schema.agentLaunches.presaleCap,
				totalDeposited: schema.agentLaunches.totalDeposited,
				depositorCount: schema.agentLaunches.depositorCount,
				closeTimestamp: schema.agentLaunches.closeTimestamp,
				launchTimestamp: schema.agentLaunches.launchTimestamp,
				v2Pair: schema.agentLaunches.v2Pair,
				metadata: schema.agentLaunches.metadata,
				createdAt: schema.agentLaunches.createdAt,
			})
			.from(schema.agentLaunches)
			.limit(limit);
		return rows.map((r) => rowToSnapshot(r as AgentLaunchRowSelect));
	}

	async listSubscriptions(launchIds: string[]): Promise<SubscriptionRecord[]> {
		if (launchIds.length === 0) return [];
		const rows = await this.db
			.select({
				launchId: schema.launchNotificationSubscriptions.launchId,
				channel: schema.launchNotificationSubscriptions.channel,
				target: schema.launchNotificationSubscriptions.target,
				botToken: schema.launchNotificationSubscriptions.botToken,
				eventFilter: schema.launchNotificationSubscriptions.eventFilter,
			})
			.from(schema.launchNotificationSubscriptions)
			.where(inArray(schema.launchNotificationSubscriptions.launchId, launchIds));

		return rows.map((row) => ({
			launchId: row.launchId,
			channel: row.channel as Channel,
			target: row.target,
			botToken: row.botToken,
			eventFilter: parseEventFilter(row.eventFilter),
		}));
	}

	async loadAlreadySent(launchIds: string[]): Promise<AlreadySentLookup> {
		if (launchIds.length === 0) return new DrizzleSet(new Set());
		const rows = await this.db
			.select({
				launchId: schema.launchNotifications.launchId,
				eventType: schema.launchNotifications.eventType,
				channel: schema.launchNotifications.channel,
				dedupeKey: schema.launchNotifications.dedupeKey,
			})
			.from(schema.launchNotifications)
			.where(inArray(schema.launchNotifications.launchId, launchIds));
		const keys = new Set<string>();
		for (const row of rows) {
			keys.add(`${row.launchId}:${row.eventType}:${row.channel}:${row.dedupeKey}`);
		}
		return new DrizzleSet(keys);
	}

	async recordSend(input: NotificationLogInput): Promise<void> {
		await this.db
			.insert(schema.launchNotifications)
			.values({
				launchId: input.launchId,
				eventType: input.eventType,
				channel: input.channel,
				dedupeKey: input.dedupeKey,
				webhookUrl: input.webhookUrl,
				status: input.status,
				statusCode: input.statusCode,
				errorMessage: input.errorMessage,
				payload: input.payload,
			})
			.onConflictDoNothing();
	}
}

function parseEventFilter(filter: unknown): ReadonlyArray<EventType> | null {
	if (!filter || typeof filter !== "object") return null;
	if (Array.isArray(filter)) {
		return filter.filter((x): x is EventType => typeof x === "string");
	}
	const obj = filter as Record<string, unknown>;
	const events = obj.events;
	if (Array.isArray(events)) {
		return events.filter((x): x is EventType => typeof x === "string");
	}
	return null;
}
