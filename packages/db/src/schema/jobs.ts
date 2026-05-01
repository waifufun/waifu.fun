import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";

export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "completed", "failed", "retrying", "dead"]);

export const jobs = pgTable(
	"jobs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		queueName: text("queue_name").notNull(),
		jobType: text("job_type").notNull(),
		referenceType: text("reference_type"),
		referenceId: text("reference_id"),
		payload: jsonb("payload").$type<JsonMap>().notNull().default(emptyJsonObject),
		result: jsonb("result").$type<JsonMap>(),
		status: jobStatusEnum("status").notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(3),
		lastError: text("last_error"),
		runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		idempotencyKey: text("idempotency_key").unique(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		queueStatusIdx: index("idx_jobs_queue_status").on(table.queueName, table.status, table.runAfter),
		referenceIdx: index("idx_jobs_reference").on(table.referenceType, table.referenceId),
		idempotencyIdx: index("idx_jobs_idempotency")
			.on(table.idempotencyKey)
			.where(sql`${table.idempotencyKey} is not null`),
	}),
);
