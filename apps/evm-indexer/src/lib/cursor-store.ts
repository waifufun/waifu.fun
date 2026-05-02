import { type Database, schema } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import { eq, sql } from "drizzle-orm";
import type { Address } from "viem";

export interface IndexerCursor {
	id: string;
	mode: "live" | "backfill";
	lastBlock: bigint;
	lastLogIndex: number;
	updatedAt: Date;
}

export interface CursorStore {
	ensure(input: {
		id: string;
		mode: "live" | "backfill";
		initialBlock?: bigint;
		contractAddress?: Address;
	}): Promise<IndexerCursor>;
	read(id: string): Promise<IndexerCursor | null>;
	advance(id: string, position: { blockNumber: bigint; logIndex: number }): Promise<IndexerCursor>;
}

export class InMemoryCursorStore implements CursorStore {
	private readonly cursors = new Map<string, IndexerCursor>();

	async ensure(input: {
		id: string;
		mode: "live" | "backfill";
		initialBlock?: bigint;
		contractAddress?: Address;
	}): Promise<IndexerCursor> {
		const existing = this.cursors.get(input.id);

		if (existing) {
			return existing;
		}

		const cursor: IndexerCursor = {
			id: input.id,
			mode: input.mode,
			lastBlock: input.initialBlock ?? 0n,
			lastLogIndex: 0,
			updatedAt: new Date(),
		};

		this.cursors.set(input.id, cursor);
		return cursor;
	}

	async read(id: string): Promise<IndexerCursor | null> {
		return this.cursors.get(id) ?? null;
	}

	async advance(id: string, position: { blockNumber: bigint; logIndex: number }): Promise<IndexerCursor> {
		const cursor = this.cursors.get(id);

		if (!cursor) {
			throw new Error(`Cursor ${id} does not exist`);
		}

		const isNewerPosition =
			position.blockNumber > cursor.lastBlock ||
			(position.blockNumber === cursor.lastBlock && position.logIndex >= cursor.lastLogIndex);

		if (!isNewerPosition) {
			return cursor;
		}

		const next: IndexerCursor = {
			...cursor,
			lastBlock: position.blockNumber,
			lastLogIndex: position.logIndex,
			updatedAt: new Date(),
		};

		this.cursors.set(id, next);
		return next;
	}
}

export class DrizzleCursorStore implements CursorStore {
	constructor(
		private readonly db: Database,
		private readonly logger: Logger,
		private readonly chainId: number,
		private readonly contractAddress: Address,
	) {}

	async ensure(input: {
		id: string;
		mode: "live" | "backfill";
		initialBlock?: bigint;
		contractAddress?: Address;
	}): Promise<IndexerCursor> {
		const existing = await this.read(input.id);
		if (existing) {
			return existing;
		}

		const initialBlock = input.initialBlock ?? 0n;

		await this.db
			.insert(schema.indexerCursors)
			.values({
				id: input.id,
				chainId: this.chainId,
				contractAddress: input.contractAddress ?? this.contractAddress,
				lastBlock: initialBlock,
				lastBlockTime: null,
				isActive: input.mode === "live",
				backfillDone: input.mode === "backfill" ? false : undefined,
			})
			.onConflictDoNothing();

		const cursor = await this.read(input.id);
		if (!cursor) {
			throw new Error(`Failed to ensure cursor ${input.id}`);
		}

		return cursor;
	}

	async read(id: string): Promise<IndexerCursor | null> {
		const [row] = await this.db
			.select({
				id: schema.indexerCursors.id,
				lastBlock: schema.indexerCursors.lastBlock,
				updatedAt: schema.indexerCursors.updatedAt,
			})
			.from(schema.indexerCursors)
			.where(eq(schema.indexerCursors.id, id))
			.limit(1);

		if (!row) {
			return null;
		}

		return {
			id: row.id,
			mode: row.id.includes(":live") ? "live" : "backfill",
			lastBlock: row.lastBlock,
			lastLogIndex: 0,
			updatedAt: row.updatedAt,
		};
	}

	async advance(id: string, position: { blockNumber: bigint; logIndex: number }): Promise<IndexerCursor> {
		const cursor = await this.read(id);
		if (!cursor) {
			throw new Error(`Cursor ${id} does not exist`);
		}

		const isNewerPosition =
			position.blockNumber > cursor.lastBlock ||
			(position.blockNumber === cursor.lastBlock && position.logIndex >= cursor.lastLogIndex);

		if (!isNewerPosition) {
			return cursor;
		}

		await this.db
			.update(schema.indexerCursors)
			.set({
				lastBlock: position.blockNumber,
				lastPollAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(eq(schema.indexerCursors.id, id));

		return {
			...cursor,
			lastBlock: position.blockNumber,
			lastLogIndex: position.logIndex,
			updatedAt: new Date(),
		};
	}
}
