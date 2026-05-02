import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject, pgBytea } from "./_common.js";
import { agentPersonas } from "./agent-personas.js";
import { creators } from "./creators.js";
import { inviteCodes } from "./invite-codes.js";

export const launchStatuses = [
	"draft",
	"pending_review",
	"approved",
	"preparing",
	"ready",
	"submitted",
	"confirmed",
	"provisioned",
	"queued",
	"launching",
	"live",
	"failed",
	"rejected",
] as const;

export type LaunchStatus = (typeof launchStatuses)[number];

export const launches = pgTable(
	"launches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => creators.id),
		/** Agent persona that owns this patron-authorized launch. Nullable for legacy rows. */
		agentId: uuid("agent_id").references(() => agentPersonas.id),
		inviteCodeId: uuid("invite_code_id").references(() => inviteCodes.id),
		tokenName: text("token_name").notNull(),
		tokenTicker: text("token_ticker").notNull(),
		tokenImageUrl: text("token_image_url"),
		tokenDescription: text("token_description"),
		metadataUri: text("metadata_uri"),
		socials: jsonb("socials").$type<JsonMap>().notNull().default(emptyJsonObject),
		chainId: integer("chain_id").notNull(),
		portalAddress: text("portal_address").notNull(),
		quoteToken: text("quote_token"),
		taxRate: integer("tax_rate").notNull().default(0),
		creatorAddress: text("creator_address"),
		taxRecipientAddress: text("tax_recipient_address"),
		firstBuyWei: text("first_buy_wei").default("0").notNull(),
		launchAuthorizedAt: timestamp("launch_authorized_at", { withTimezone: true }),
		launchAuthorizedBy: text("launch_authorized_by"),
		taxSplit: jsonb("tax_split").$type<{
			agentBps: number;
			patronBps: number;
			splitterAddress?: string;
		}>(),
		salt: pgBytea("salt"),
		tokenType: text("token_type").notNull().default("standard"),
		status: text("status").$type<LaunchStatus>().notNull().default("draft"),
		txHash: text("tx_hash"),
		tokenAddress: text("token_address"),
		failureReason: text("failure_reason"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		creatorIdx: index("idx_launches_creator").on(table.creatorId, sql`${table.createdAt} desc`),
		statusIdx: index("idx_launches_status").on(table.status),
		agentIdx: index("idx_launches_agent_id").on(table.agentId),
		tokenIdx: index("idx_launches_token").on(table.tokenAddress).where(sql`${table.tokenAddress} is not null`),
	}),
);
