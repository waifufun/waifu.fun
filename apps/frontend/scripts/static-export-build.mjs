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
import { spawn } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stashRoot = join(root, "..", ".frontend-static-export-stash");
const nextBin = join(root, "node_modules/.bin/next");
const pagesDir = join(root, "src/pages");
const pagesApp = join(pagesDir, "_app.tsx");
const pages404 = join(pagesDir, "404.tsx");
const generatedPagesApp = [
	'import type { AppProps } from "next/app";',
	"",
	"export default function App({ Component, pageProps }: AppProps) {",
	"\treturn <Component {...pageProps} />;",
	"}",
	"",
].join("\n");
const generatedPages404 = "export default function Custom404() {\n\treturn <main />;\n}\n";

const moves = [
	["src/app/api", "app-api"],
	["src/app/auth/twitter/login/route.ts", "twitter-login-route.ts"],
	["src/app/opengraph-image.tsx", "root-opengraph-image.tsx"],
	["src/app/token/[chain]/[chainId]/[contractAddress]/opengraph-image.tsx", "token-opengraph-image.tsx"],
];

function ensureParentDir(filePath) {
	mkdirSync(dirname(filePath), { recursive: true });
}

function removeTree(path) {
	rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function stashAll() {
	mkdirSync(stashRoot, { recursive: true });
	for (const [relFrom, stashName] of moves) {
		const from = join(root, relFrom);
		const to = join(stashRoot, stashName);
		if (!existsSync(from)) continue;
		if (existsSync(to)) removeTree(to);
		ensureParentDir(to);
		renameSync(from, to);
	}
}

function restoreAll() {
	for (const [relFrom, stashName] of moves) {
		const from = join(root, relFrom);
		const stashed = join(stashRoot, stashName);
		if (!existsSync(stashed)) continue;
		if (existsSync(from)) removeTree(from);
		ensureParentDir(from);
		renameSync(stashed, from);
	}
	try {
		removeTree(stashRoot);
	} catch {
		/* ignore */
	}
}

function ensurePagesFiles() {
	mkdirSync(pagesDir, { recursive: true });
	if (!existsSync(pagesApp)) {
		writeFileSync(pagesApp, generatedPagesApp);
	}
	if (!existsSync(pages404)) {
		writeFileSync(pages404, generatedPages404);
	}
}

function removeGeneratedPagesLeftovers() {
	if (existsSync(pagesApp) && readFileSync(pagesApp, "utf8") === generatedPagesApp) rmSync(pagesApp, { force: true });
	if (existsSync(pages404) && readFileSync(pages404, "utf8") === generatedPages404) rmSync(pages404, { force: true });
	if (existsSync(pagesDir) && readdirSync(pagesDir).length === 0) removeTree(pagesDir);
}

restoreAll();
removeGeneratedPagesLeftovers();
let exitCode = 1;
const hadPagesDir = existsSync(pagesDir);
const hadPagesApp = existsSync(pagesApp);
const hadPages404 = existsSync(pages404);
let child = null;
let cleaned = false;

function cleanup() {
	if (cleaned) return;
	cleaned = true;
	if (!hadPagesApp) rmSync(pagesApp, { force: true });
	if (!hadPages404) rmSync(pages404, { force: true });
	if (!hadPagesDir) removeTree(pagesDir);
	else removeGeneratedPagesLeftovers();
	restoreAll();
}

function handleSignal(signal) {
	if (child && child.exitCode === null && child.signalCode === null) {
		child.kill(signal);
	}
	cleanup();
	process.kill(process.pid, signal);
}

process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);
process.once("SIGHUP", handleSignal);

try {
	stashAll();
	removeTree(join(root, ".next"));
	if (!hadPagesApp || !hadPages404) ensurePagesFiles();
	// STATIC_EXPORT=true gates generateStaticParams() enumeration so dev mode
	// (next dev) doesn't fan out to the API on every page visit.
	const env = { ...process.env, STATIC_EXPORT: "true" };
	child = spawn(nextBin, ["build"], {
		cwd: root,
		stdio: "inherit",
		env,
		shell: process.platform === "win32",
	});
	exitCode = await new Promise((resolve) => {
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
} finally {
	cleanup();
}

// Cloudflare Pages expects the Functions directory at the deploy-root
// (i.e. inside `out/`) so the rewrite catch-all in `functions/[[path]].js`
// runs for dynamic routes like `/launch/<id>` and `/claim/<token>`. Without
// this copy, CF Pages serves the static 404.html for any path that isn't
// pre-generated, including every real launch id.
if (exitCode === 0) {
	try {
		const fnSrc = join(root, "functions");
		const fnDest = join(root, "out", "functions");
		if (existsSync(fnSrc)) {
			copyDirRecursive(fnSrc, fnDest);
		}
	} catch (err) {
		console.error("[static-export] failed to copy Cloudflare Pages Functions into out/:", err);
		exitCode = 1;
	}
}

process.exit(exitCode);

function copyDirRecursive(src, dest) {
	mkdirSync(dest, { recursive: true });
	for (const name of readdirSync(src)) {
		const s = join(src, name);
		const d = join(dest, name);
		const stat = statSync(s);
		if (stat.isDirectory()) {
			copyDirRecursive(s, d);
		} else if (stat.isFile()) {
			copyFileSync(s, d);
		}
	}
}
