import { sql } from "drizzle-orm";
import { bigserial, index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";
import { creators } from "./creators.js";

export const adminAuditLog = pgTable(
	"admin_audit_log",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		adminId: uuid("admin_id")
			.notNull()
			.references(() => creators.id),
		action: text("action").notNull(),
		targetType: text("target_type"),
		targetId: text("target_id"),
		details: jsonb("details").$type<JsonMap>().default(emptyJsonObject),
		ipAddress: inet("ip_address"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		adminIdx: index("idx_audit_admin").on(table.adminId, sql`${table.createdAt} desc`),
		targetIdx: index("idx_audit_target").on(table.targetType, table.targetId),
		timeIdx: index("idx_audit_time").on(sql`${table.createdAt} desc`),
	}),
);
