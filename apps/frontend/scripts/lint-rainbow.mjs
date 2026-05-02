#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = resolve(frontendRoot, "src");

const allowedFiles = new Set([
	"src/hooks/use-linked-eoa.ts",
	"src/components/auth/linked-eoa-cta.tsx",
	"src/providers/evm-provider.tsx",
]);

const importPattern =
	/(?:import|export)\s+(?:[^;]*?\s+from\s+)?["'](@rainbow-me\/rainbowkit(?:\/[^"']*)?)["']|import\(\s*["'](@rainbow-me\/rainbowkit(?:\/[^"']*)?)["']\s*\)/gs;
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

async function collectFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath)));
			continue;
		}

		const extension = entry.name.slice(entry.name.lastIndexOf("."));
		if (entry.isFile() && sourceExtensions.has(extension)) {
			files.push(fullPath);
		}
	}

	return files;
}

const files = await collectFiles(srcRoot);
const violations = [];

for (const filePath of files) {
	const relativePath = relative(frontendRoot, filePath).replaceAll("\\", "/");
	const source = await readFile(filePath, "utf8");
	const matches = [...source.matchAll(importPattern)].map((match) => match[1] ?? match[2]);

	if (matches.length > 0 && !allowedFiles.has(relativePath)) {
		violations.push({ relativePath, imports: [...new Set(matches)] });
	}
}

if (violations.length > 0) {
	console.error("RainbowKit imports are only allowed in the linked EOA flow:");
	for (const file of allowedFiles) {
		console.error(`  - ${file}`);
	}
	console.error("\nDisallowed RainbowKit imports found:");
	for (const violation of violations) {
		console.error(`  - ${violation.relativePath}: ${violation.imports.join(", ")}`);
	}
	process.exit(1);
}

console.log("RainbowKit import scope check passed.");
