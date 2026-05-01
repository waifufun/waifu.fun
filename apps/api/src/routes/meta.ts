import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";

import { openApiSpec } from "../lib/openapi.js";

// Resolve AGENT.md relative to the monorepo root (two levels up from apps/api).
// At runtime: dist/index.js → process.cwd() is the monorepo root when started
// via `node dist/index.js` from the monorepo root, or we walk up from __filename.
function resolveAgentMd(): string {
	// __dirname equivalent in ESM
	const here = fileURLToPath(import.meta.url);
	// src/routes/meta.ts → ../../.. → monorepo root
	const candidates = [
		join(here, "..", "..", "..", "..", "..", "AGENT.md"), // dist/routes/meta.js
		join(here, "..", "..", "..", "AGENT.md"), // src/routes/meta.ts (tsx dev)
		join(process.cwd(), "AGENT.md"),
		join(process.cwd(), "..", "..", "AGENT.md"),
	];

	for (const p of candidates) {
		try {
			const content = readFileSync(p, "utf-8");
			return content;
		} catch {
			// try next
		}
	}

	// Fallback: return a minimal stub so the route never 500s
	return "# waifu.fun agent spec\n\nspec unavailable — see https://docs.waifu.fun/for-agents\n";
}

export function createMetaRoutes() {
	const app = new Hono();

	/**
	 * GET /AGENT.md
	 * Returns the canonical agent integration spec as text/markdown.
	 * Agents are encouraged to fetch this to self-discover the launch API.
	 */
	app.get("/AGENT.md", (c) => {
		const content = resolveAgentMd();
		c.header("Content-Type", "text/markdown; charset=utf-8");
		c.header("Cache-Control", "public, max-age=300");
		return c.body(content, 200);
	});

	/**
	 * GET /openapi.json
	 * Returns the OpenAPI 3.1 spec for the entire API.
	 */
	app.get("/openapi.json", (c) => {
		c.header("Cache-Control", "public, max-age=300");
		return c.json(openApiSpec, 200);
	});

	return app;
}
