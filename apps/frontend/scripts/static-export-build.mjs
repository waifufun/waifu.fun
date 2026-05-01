#!/usr/bin/env node
/**
 * Static HTML export for Cloudflare Pages (`out/`).
 *
 * Prerequisite: build workspace packages the frontend imports (`@waifufun/types`,
 * `@waifufun/constants`, etc.) the same way your normal `next build` / monorepo CI does —
 * those packages ship `dist/` entrypoints.
 *
 * Temporarily moves App Router Route Handlers aside — incompatible with `output: "export"`.
 * The route files remain in source for local `next dev` (they back same-origin auth and
 * the API proxy during development) but are not part of the deployed static bundle.
 *
 * Also moves token OG generation aside: Next.js does not pick up `generateStaticParams()` on
 * `opengraph-image.tsx` the same way as `page.tsx`, so static export would fail otherwise.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stashRoot = join(root, ".static-export-stash");

const moves = [
	["src/app/api", "app-api"],
	["src/app/auth/twitter/login/route.ts", "twitter-login-route.ts"],
	["src/app/token/[chain]/[chainId]/[contractAddress]/opengraph-image.tsx", "token-opengraph-image.tsx"],
];

function ensureParentDir(filePath) {
	mkdirSync(dirname(filePath), { recursive: true });
}

function stashAll() {
	mkdirSync(stashRoot, { recursive: true });
	for (const [relFrom, stashName] of moves) {
		const from = join(root, relFrom);
		const to = join(stashRoot, stashName);
		if (!existsSync(from)) continue;
		if (existsSync(to)) rmSync(to, { recursive: true, force: true });
		ensureParentDir(to);
		renameSync(from, to);
	}
}

function restoreAll() {
	for (const [relFrom, stashName] of moves) {
		const from = join(root, relFrom);
		const stashed = join(stashRoot, stashName);
		if (!existsSync(stashed)) continue;
		if (existsSync(from)) rmSync(from, { recursive: true, force: true });
		ensureParentDir(from);
		renameSync(stashed, from);
	}
	try {
		rmSync(stashRoot, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

stashAll();
let exitCode = 1;
try {
	// STATIC_EXPORT=true gates generateStaticParams() enumeration so dev mode
	// (next dev) doesn't fan out to the API on every page visit.
	const env = { ...process.env, STATIC_EXPORT: "true" };
	const result = spawnSync("npx", ["next", "build"], {
		cwd: root,
		stdio: "inherit",
		env,
		shell: process.platform === "win32",
	});
	exitCode = result.status ?? 1;
} finally {
	restoreAll();
}
process.exit(exitCode);
