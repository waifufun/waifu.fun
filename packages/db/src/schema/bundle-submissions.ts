import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";

/**
 * Bundle submissions ledger.
 *
 * Tracks every signed transaction we route through 48 Club's Puissant private
 * RPC, including fallback attempts to the public mempool.
 *
 * Status values:
 *   - submitted: tx accepted by Puissant, awaiting inclusion
 *   - included:  tx included on-chain (via private path or public fallback)
 *   - fell_back: Puissant did not include within deadline; fallback enqueued
 *   - expired:   deadline elapsed and no inclusion
 *   - failed:    submission errored on every available path
 */
export const bundleSubmissions = pgTable(
	"bundle_submissions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		bundleHash: text("bundle_hash").notNull().unique(),
		txHash: text("tx_hash"),
		rawTx: text("raw_tx").notNull(),
		chainId: integer("chain_id").notNull().default(56),
		status: text("status").notNull().default("submitted"),
		path: text("path").notNull().default("puissant"),
		blockNumber: text("block_number"),
		fallbackTxHash: text("fallback_tx_hash"),
		deadline: timestamp("deadline", { withTimezone: true }).notNull(),
		submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
		includedAt: timestamp("included_at", { withTimezone: true }),
		expiredAt: timestamp("expired_at", { withTimezone: true }),
		fallbackAt: timestamp("fallback_at", { withTimezone: true }),
		lastError: text("last_error"),
		attempts: integer("attempts").notNull().default(1),
		metadata: jsonb("metadata").$type<JsonMap>().notNull().default(emptyJsonObject),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		statusIdx: index("idx_bundle_submissions_status").on(table.status),
		txHashIdx: index("idx_bundle_submissions_tx_hash").on(table.txHash),
		submittedAtIdx: index("idx_bundle_submissions_submitted_at").on(table.submittedAt.desc()),
	}),
);

export type BundleSubmissionRow = typeof bundleSubmissions.$inferSelect;
export type NewBundleSubmissionRow = typeof bundleSubmissions.$inferInsert;

export const BUNDLE_STATUSES = ["submitted", "included", "fell_back", "expired", "failed"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

export const BUNDLE_PATHS = ["puissant", "public", "puissant+public"] as const;
export type BundlePath = (typeof BUNDLE_PATHS)[number];
