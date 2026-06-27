import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guard against silently bypassing the resilience layer.
 *
 * `createElizaCloudClient({ ... })` takes an opt-IN `resilient` flag (defaults to
 * false so the raw constructor stays transparent for unit tests). Every PRODUCTION
 * call site under apps/api/src is a patron-facing request path and MUST pass
 * `resilient: true`, or it silently skips the circuit breaker + 503 translation and
 * NO existing test would catch it. This test scans the source tree and fails if any
 * call site omits the flag — including a brand-new one a future contributor adds.
 *
 * Scope: all `.ts` files under apps/api/src EXCEPT
 *   - `*.test.ts` (tests legitimately build the raw client to assert upstream behaviour), and
 *   - the definition file `services/eliza-client.ts` (declares the param; not a call site).
 */

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// services/ -> src/
const SRC_DIR = dirname(THIS_DIR);
const DEFINITION_FILE = join(SRC_DIR, "services", "eliza-client.ts");
const CALL = "createElizaCloudClient(";

function listSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			out.push(...listSourceFiles(full));
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
			out.push(full);
		}
	}
	return out;
}

/**
 * Given the index of the `(` opening a call, return the substring of the full call
 * argument list up to (and including) the matching `)`, tracking paren/brace depth
 * AND skipping string/template/comment content so braces inside strings or `// ... )`
 * don't throw off the balance count.
 */
function extractCallArgs(source: string, openParenIdx: number): string {
	let depth = 0;
	let i = openParenIdx;
	let quote: '"' | "'" | "`" | null = null;
	let inLineComment = false;
	let inBlockComment = false;

	for (; i < source.length; i += 1) {
		const ch = source[i];
		const next = source[i + 1];

		if (inLineComment) {
			if (ch === "\n") inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (ch === "*" && next === "/") {
				inBlockComment = false;
				i += 1;
			}
			continue;
		}
		if (quote) {
			if (ch === "\\") {
				i += 1; // skip escaped char
			} else if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === "/" && next === "/") {
			inLineComment = true;
			i += 1;
			continue;
		}
		if (ch === "/" && next === "*") {
			inBlockComment = true;
			i += 1;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "(") depth += 1;
		else if (ch === ")") {
			depth -= 1;
			if (depth === 0) return source.slice(openParenIdx, i + 1);
		}
	}
	throw new Error("unbalanced parentheses while scanning a createElizaCloudClient(...) call");
}

test("every production createElizaCloudClient() call passes resilient: true", () => {
	const files = listSourceFiles(SRC_DIR).filter((f) => f !== DEFINITION_FILE);
	const offenders: string[] = [];
	let callSitesChecked = 0;

	for (const file of files) {
		const source = readFileSync(file, "utf8");
		let searchFrom = 0;
		for (;;) {
			const idx = source.indexOf(CALL, searchFrom);
			if (idx === -1) break;
			const openParen = idx + CALL.length - 1; // index of the "(" in the call token
			const args = extractCallArgs(source, openParen);
			searchFrom = idx + CALL.length;
			callSitesChecked += 1;
			// Tolerant of whitespace: `resilient: true` / `resilient:true`.
			if (!/\bresilient\s*:\s*true\b/.test(args)) {
				const line = source.slice(0, idx).split("\n").length;
				offenders.push(`${relative(SRC_DIR, file).split(sep).join("/")}:${line}`);
			}
		}
	}

	assert.ok(
		callSitesChecked > 0,
		"expected to find at least one createElizaCloudClient() call site — did the scan path break?",
	);
	assert.deepEqual(
		offenders,
		[],
		`createElizaCloudClient() call site(s) missing \`resilient: true\` — production calls bypass the circuit breaker. Add the flag at: ${offenders.join(", ")}`,
	);
});
