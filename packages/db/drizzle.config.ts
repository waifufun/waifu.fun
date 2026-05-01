import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./dist/schema/index.js",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/waifu_core",
	},
	strict: true,
	verbose: true,
});
