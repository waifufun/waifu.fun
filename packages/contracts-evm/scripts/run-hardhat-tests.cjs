#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: sleep } = require("node:timers/promises");

const args = process.argv.slice(2);
const root = process.cwd();
const hardhatBinName = process.platform === "win32" ? "hardhat.cmd" : "hardhat";
const localHardhatBin = path.join(root, "node_modules", ".bin", hardhatBinName);
const hardhatBin = fs.existsSync(localHardhatBin) ? localHardhatBin : hardhatBinName;

const forkTestFiles = [
	"test/wave-m-agent-safe-deployer.test.js",
	"test/integration/flap-curve-calibration.test.js",
	"test/integration/treasury-lp5-real-fork.test.js",
	"test/integration/waifu-launch-day-fork.test.js",
	"test/integration/wave-h-real-fork.test.js",
	"test/integration/wave-h-tier-test-real-fork.test.js",
	"test/integration/wave-m-real-fork.test.js",
];

function isTruthy(value) {
	return value === "true" || value === "1" || value === "yes";
}

function redactUrl(value) {
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname.length > 1 ? "/<redacted>" : "/"}`;
	} catch {
		return "<redacted>";
	}
}

function runHardhat(testArgs, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(hardhatBin, ["test", ...testArgs], {
			cwd: root,
			env: { ...process.env, ...env },
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) reject(new Error(`hardhat test terminated by ${signal}`));
			else resolve(code ?? 1);
		});
	});
}

function parseRetryAfter(value) {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	if (Number.isFinite(date)) return Math.max(0, date - Date.now());
	return undefined;
}

function createRateLimitedRpcProxy(upstreamUrl) {
	const attempts = Number.parseInt(process.env.FORK_BSC_RPC_RETRY_ATTEMPTS || "7", 10);
	const baseBackoffMs = Number.parseInt(process.env.FORK_BSC_RPC_RETRY_BASE_MS || "1000", 10);
	const maxBackoffMs = Number.parseInt(process.env.FORK_BSC_RPC_RETRY_MAX_MS || "15000", 10);
	const minIntervalMs = Number.parseInt(process.env.FORK_BSC_RPC_MIN_INTERVAL_MS || "150", 10);
	const timeoutMs = Number.parseInt(process.env.FORK_BSC_RPC_TIMEOUT_MS || "120000", 10);
	let nextSlot = Promise.resolve();
	let retried = 0;

	async function reserveSlot() {
		const slot = nextSlot.then(async () => {
			if (minIntervalMs > 0) await sleep(minIntervalMs);
		});
		nextSlot = slot.catch(() => {});
		await slot;
	}

	async function forward(body, headers) {
		let lastError;
		for (let attempt = 1; attempt <= attempts; attempt++) {
			await reserveSlot();
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetch(upstreamUrl, {
					method: "POST",
					headers: {
						"content-type": headers["content-type"] || "application/json",
						accept: headers.accept || "application/json",
					},
					body,
					signal: controller.signal,
				});
				const text = await response.text();
				if (![429, 500, 502, 503, 504].includes(response.status)) {
					return { status: response.status, headers: response.headers, body: text };
				}
				lastError = new Error(`upstream returned HTTP ${response.status}`);
				if (attempt === attempts) return { status: response.status, headers: response.headers, body: text };
				const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
				const exponentialMs = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (attempt - 1));
				const jitterMs = Math.floor(Math.random() * 250);
				retried += 1;
				await sleep((retryAfterMs ?? exponentialMs) + jitterMs);
			} catch (error) {
				lastError = error;
				if (attempt === attempts) throw error;
				const exponentialMs = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (attempt - 1));
				retried += 1;
				await sleep(exponentialMs);
			} finally {
				clearTimeout(timer);
			}
		}
		throw lastError;
	}

	const server = http.createServer((req, res) => {
		if (req.method !== "POST") {
			res.writeHead(405, { "content-type": "text/plain" });
			res.end("method not allowed");
			return;
		}

		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", async () => {
			try {
				const body = Buffer.concat(chunks);
				const upstream = await forward(body, req.headers);
				res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
				res.end(upstream.body);
			} catch (error) {
				res.writeHead(502, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: { code: -32000, message: error.message || "fork RPC proxy failed" } }));
			}
		});
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			const { port } = server.address();
			resolve({
				url: `http://127.0.0.1:${port}`,
				close: () => new Promise((done) => server.close(done)),
				stats: () => ({ retried, minIntervalMs, attempts }),
			});
		});
	});
}

async function main() {
	const forkRequested = isTruthy(process.env.FORK_BSC);
	const forkRequired = isTruthy(process.env.REQUIRE_BSC_FORK);
	const upstreamUrl = process.env.FORK_BSC_URL;

	if (forkRequired && (!forkRequested || !upstreamUrl)) {
		throw new Error("REQUIRE_BSC_FORK=true but FORK_BSC=true and FORK_BSC_URL were not both provided");
	}

	if (!forkRequested || !upstreamUrl) {
		process.exit(await runHardhat(args, {}));
	}

	const proxy = await createRateLimitedRpcProxy(upstreamUrl);
	console.log(`[bsc-fork] using retrying, rate-limited RPC proxy for ${redactUrl(upstreamUrl)}`);
	console.log(`[bsc-fork] minIntervalMs=${proxy.stats().minIntervalMs} retryAttempts=${proxy.stats().attempts}`);
	let exitCode = 1;
	try {
		if (args.length > 0) {
			exitCode = await runHardhat(args, { FORK_BSC_URL: proxy.url });
		} else {
			console.log("[bsc-fork] running non-fork contract tests first to avoid unnecessary archive RPC load");
			exitCode = await runHardhat([], { FORK_BSC: "false", REQUIRE_BSC_FORK: "false" });

			if (exitCode === 0) {
				console.log("[bsc-fork] running BSC fork coverage serially through the RPC proxy");
				exitCode = await runHardhat(forkTestFiles, { FORK_BSC: "true", FORK_BSC_URL: proxy.url });
			}
		}

		const stats = proxy.stats();
		console.log(`[bsc-fork] RPC retries performed: ${stats.retried}`);
	} finally {
		await proxy.close();
	}
	process.exit(exitCode);
}

main().catch((error) => {
	console.error(error.stack || error.message || error);
	process.exit(1);
});
