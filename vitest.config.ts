import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: [
			"apps/frontend/src/**/*.test.{ts,tsx}",
			"apps/frontend/src/**/__tests__/**/*.{ts,tsx}",
			"packages/**/*.test.{ts,tsx}",
			"tests/**/*.test.{ts,tsx}",
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"apps/frontend/src/__tests__/",
				"**/*.test.{ts,tsx}",
				"**/*.spec.{ts,tsx}",
				"**/dist/**",
				"**/build/**",
			],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./apps/frontend/src"),
			"@autofun/constants": path.resolve(__dirname, "./packages/constants/src"),
			"@autofun/types": path.resolve(__dirname, "./packages/types/src"),
		},
	},
});
