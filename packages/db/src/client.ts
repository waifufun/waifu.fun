import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/waifu_core";

export const resolveDatabaseUrl = (connectionString = process.env.DATABASE_URL) => {
	if (connectionString && connectionString.length > 0) {
		return connectionString;
	}

	return DEFAULT_DATABASE_URL;
};

export const createDatabase = (
	connectionString = process.env.DATABASE_URL,
	options: postgres.Options<Record<string, postgres.PostgresType>> = {},
) => {
	const client = postgres(resolveDatabaseUrl(connectionString), {
		max: 10,
		idle_timeout: 20,
		connect_timeout: 10,
		...options,
	});

	const db = drizzle(client, { schema, casing: "snake_case" });

	return { client, db, schema };
};

let globalDatabase: ReturnType<typeof createDatabase> | undefined;

export const getDatabase = (connectionString = process.env.DATABASE_URL) => {
	if (!globalDatabase) {
		globalDatabase = createDatabase(connectionString);
	}

	return globalDatabase;
};

export type DatabaseClient = ReturnType<typeof createDatabase>;
export type Database = DatabaseClient["db"];
export type DatabaseSchema = typeof schema;
