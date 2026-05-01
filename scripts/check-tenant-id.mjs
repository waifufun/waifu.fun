import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const needle = ["waifu", "fun"].join("-");
const roots = [
	"apps/api",
	"apps/brain",
	"apps/evm-indexer",
	"apps/mcp",
	"apps/worker",
	"packages/agent-actions",
	"packages/agent-runtime",
	"packages/config",
	"packages/db",
	"packages/flap",
	"packages/fourmeme",
	"packages/launchpad",
	"packages/metrics",
	"packages/queue",
	"demo",
];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".sh"]);
const allowMarker = "// LEGACY:";
const ignoredDirs = new Set(["node_modules", ".turbo", "dist", "coverage", ".next"]);

function hasCheckedExtension(path) {
	return [...extensions].some((extension) => path.endsWith(extension));
}

function* filesUnder(dir) {
	for (const entry of readdirSync(dir)) {
		if (ignoredDirs.has(entry)) continue;

		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			yield* filesUnder(path);
		} else if (stat.isFile() && hasCheckedExtension(path)) {
			yield path;
		}
	}
}

const hits = [];

for (const root of roots) {
	if (!existsSync(root)) continue;
	for (const file of filesUnder(root)) {
		const content = readFileSync(file, "utf8");
		const lines = content.split(/\r?\n/);
		lines.forEach((line, index) => {
			if (line.includes(needle) && !line.includes(allowMarker)) {
				hits.push(`${relative(process.cwd(), file)}:${index + 1}:${line}`);
			}
		});
	}
}

if (hits.length > 0) {
	console.error(`[w9.8] '${needle}' literal detected (use 'waifu'):`);
	console.error(hits.join("\n"));
	process.exit(1);
}
