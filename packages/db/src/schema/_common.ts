import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

export type JsonMap = Record<string, unknown>;

export const emptyJsonObject = sql`'{}'::jsonb`;

export const pgBytea = customType<{
	data: Uint8Array;
	driverData: Uint8Array;
}>({
	dataType() {
		return "bytea";
	},
});
