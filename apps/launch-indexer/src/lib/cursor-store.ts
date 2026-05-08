/**
 * Cursor store for the W44 launch indexer.
 *
 * One cursor per (chainId, contractAddress) on the on-chain side; we reuse
 * the existing `indexer_cursors` table.
 */

import { type Database, schema } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import { eq, sql } from "drizzle-orm";
import type { Address } from "viem";

export interface IndexerCursor {
	id: string;
	lastBlock: bigint;
	updatedAt: Date;
}

export interface CursorStore {
	ensure(input: { id: string; contractAddress: Address; initialBlock?: bigint }): Promise<IndexerCursor>;
	read(id: string): Promise<IndexerCursor | null>;
	advance(id: string, blockNumber: bigint): Promise<IndexerCursor>;
}

export class InMemoryCursorStore implements CursorStore {
	private readonly cursors = new Map<string, IndexerCursor>();

	async ensure(input: { id: string; contractAddress: Address; initialBlock?: bigint }): Promise<IndexerCursor> {
		const existing = this.cursors.get(input.id);
		if (existing) return existing;
		const cursor: IndexerCursor = {
			id: input.id,
			lastBlock: input.initialBlock ?? 0n,
			updatedAt: new Date(),
		};
		this.cursors.set(input.id, cursor);
		return cursor;
	}

	async read(id: string): Promise<IndexerCursor | null> {
		return this.cursors.get(id) ?? null;
	}

	async advance(id: string, blockNumber: bigint): Promise<IndexerCursor> {
		const cursor = this.cursors.get(id);
		if (!cursor) throw new Error(`Cursor ${id} does not exist`);
		if (blockNumber <= cursor.lastBlock) return cursor;
		const next: IndexerCursor = { ...cursor, lastBlock: blockNumber, updatedAt: new Date() };
		this.cursors.set(id, next);
		return next;
	}
}

export class DrizzleCursorStore implements CursorStore {
	constructor(
		private readonly db: Database,
		private readonly logger: Logger,
		private readonly chainId: number,
	) {}

	async ensure(input: { id: string; contractAddress: Address; initialBlock?: bigint }): Promise<IndexerCursor> {
		const existing = await this.read(input.id);
		if (existing) return existing;

		const initialBlock = input.initialBlock ?? 0n;
		await this.db
			.insert(schema.indexerCursors)
			.values({
				id: input.id,
				chainId: this.chainId,
				contractAddress: input.contractAddress,
				lastBlock: initialBlock,
				isActive: true,
			})
			.onConflictDoNothing();

		const cursor = await this.read(input.id);
		if (!cursor) throw new Error(`Failed to ensure cursor ${input.id}`);
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
		if (!row) return null;
		return { id: row.id, lastBlock: row.lastBlock, updatedAt: row.updatedAt };
	}

	async advance(id: string, blockNumber: bigint): Promise<IndexerCursor> {
		const cursor = await this.read(id);
		if (!cursor) throw new Error(`Cursor ${id} does not exist`);
		if (blockNumber <= cursor.lastBlock) return cursor;

		await this.db
			.update(schema.indexerCursors)
			.set({
				lastBlock: blockNumber,
				lastPollAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(eq(schema.indexerCursors.id, id));

		this.logger.debug({ id, blockNumber: blockNumber.toString() }, "advanced launch indexer cursor");

		return { ...cursor, lastBlock: blockNumber, updatedAt: new Date() };
	}
}
