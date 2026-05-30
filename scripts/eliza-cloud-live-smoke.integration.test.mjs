import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";

const TOKEN_ADDRESS = "0x0000000000000000000000000000000000000004";
const AGENT_WALLET = "0x0000000000000000000000000000000000000009";
const WALLET_KEY_REF = "steward:smoke-agent-key";

function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.setEncoding("utf8");
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			if (!body) {
				resolve(null);
				return;
			}
			try {
				resolve(JSON.parse(body));
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}

function writeJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

function unsignedSmokeJwt(payload) {
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${header}.${body}.mock-signature`;
}

async function startServer(handler) {
	const server = createServer((req, res) => {
		handler(req, res).catch((error) => {
			writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert(address && typeof address === "object");
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
	};
}

async function runSmoke(apiUrl, extraEnv = {}) {
	const child = spawn(process.execPath, ["scripts/eliza-cloud-live-smoke.mjs"], {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			ADMIN_API_KEY: "admin-key",
			WAIFU_API_BASE_URL: apiUrl,
			WAIFU_ELIZA_CLOUD_LIVE_SMOKE: "1",
			WAIFU_ELIZA_SMOKE_AGENT_WALLET: AGENT_WALLET,
			WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS: TOKEN_ADDRESS,
			WAIFU_ELIZA_SMOKE_WAIT_SECONDS: "2",
			...extraEnv,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const [code] = await once(child, "close");
	return { code, stdout, stderr };
}

function createSmokeApi(runtimeUrl, { mode }) {
	const calls = [];
	const cloudAgentId = mode === "worker" ? "cloud-worker-agent" : "cloud-direct-agent";
	const containerId = mode === "worker" ? "container-worker" : "container-direct";
	let runtimeState = "running";

	return {
		calls,
		handler: async (req, res) => {
			assert(req.url);
			const url = new URL(req.url, "http://127.0.0.1");
			calls.push({ method: req.method, path: url.pathname, search: url.search, body: null });
			const call = calls.at(-1);

			if (req.method === "GET" && url.pathname === "/v2/admin/agents/eliza-cloud/status") {
				assert.equal(req.headers.authorization, "Bearer admin-key");
				writeJson(res, 200, { data: { ready: true } });
				return;
			}

			if (req.method === "POST" && url.pathname === "/v2/admin/agents/eliza-cloud/test-enqueue-provisioning") {
				assert.equal(req.headers.authorization, "Bearer admin-key");
				call.body = await readBody(req);
				assert.equal(call.body.agentEvmAddress, AGENT_WALLET);
				assert.equal(call.body.tokenContractAddress, TOKEN_ADDRESS);
				assert.equal(call.body.walletKeyRef, WALLET_KEY_REF);
				writeJson(res, 200, { data: { enqueued: true, jobId: "job-1" } });
				return;
			}

			if (req.method === "GET" && url.pathname === "/v2/admin/agents/eliza-cloud/test-runtime-ref") {
				assert.equal(req.headers.authorization, "Bearer admin-key");
				assert.equal(url.searchParams.get("agentId")?.startsWith("waifu-live-smoke-"), true);
				writeJson(res, 200, {
					data: {
						account: {
							initialFreeCreditsUsd: 5,
							isNewAccount: true,
							primaryWalletAddress: AGENT_WALLET,
							walletKeyRef: WALLET_KEY_REF,
						},
						cloudAgentId,
						containerId,
						status: "running",
						webUiUrl: runtimeUrl,
					},
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/v2/admin/agents/eliza-cloud/test-provision") {
				assert.equal(req.headers.authorization, "Bearer admin-key");
				call.body = await readBody(req);
				assert.equal(call.body.agentEvmAddress, AGENT_WALLET);
				assert.equal(call.body.adminWallet, AGENT_WALLET);
				assert.equal(call.body.tokenContractAddress, TOKEN_ADDRESS);
				assert.equal(call.body.walletKeyRef, WALLET_KEY_REF);
				writeJson(res, 200, {
					data: {
						account: {
							initialFreeCreditsUsd: 5,
							isNewAccount: true,
							primaryWalletAddress: AGENT_WALLET,
							walletKeyRef: WALLET_KEY_REF,
						},
						cloudAgentId,
						containerId,
						polling: { attempts: 1 },
						status: "provisioning",
						webUiUrl: runtimeUrl,
					},
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/v2/admin/agents/eliza-cloud/test-control") {
				assert.equal(req.headers.authorization, "Bearer admin-key");
				call.body = await readBody(req);
				assert.equal(call.body.cloudAgentId, cloudAgentId);
				switch (call.body.action) {
					case "status":
						writeJson(res, 200, {
							data: { status: { containerId, status: runtimeState, webUiUrl: runtimeUrl } },
						});
						return;
					case "balance":
						writeJson(res, 200, { data: { balance: { balance: 5, currency: "usd" } } });
						return;
					case "top-up":
						assert.equal(call.body.amountUsdCents, 500);
						writeJson(res, 200, {
							data: { checkout: { checkoutUrl: "https://billing.example/checkout/cs_mock", sessionId: "cs_mock" } },
						});
						return;
					case "verify-top-up":
						assert.equal(call.body.sessionId, "cs_mock");
						writeJson(res, 200, {
							data: { verification: { alreadyApplied: true, balance: 10, sessionId: "cs_mock" } },
						});
						return;
					case "pause":
						runtimeState = "suspended";
						writeJson(res, 200, { data: { result: { ok: true, action: call.body.action } } });
						return;
					case "resume":
						runtimeState = "running";
						writeJson(res, 200, { data: { result: { ok: true, action: call.body.action } } });
						return;
					case "restart":
						runtimeState = "running";
						writeJson(res, 200, { data: { result: { ok: true, action: call.body.action } } });
						return;
					default:
						writeJson(res, 400, { ok: false, error: `unexpected action ${call.body.action}` });
						return;
				}
			}

			if (
				req.method === "GET" &&
				url.pathname === `/owner/tokens/bsc/56/${TOKEN_ADDRESS}/chat-session`
			) {
				assert.equal(req.headers.authorization, "Bearer steward-token");
				writeJson(res, 200, {
					chatUrl: `${runtimeUrl}/chat?waifu_access_token=${unsignedSmokeJwt({
						iss: "waifu.fun",
						aud: "eliza-cloud-chat",
						exp: Math.floor(Date.now() / 1000) + 900,
						role: "user",
						walletAddress: "0x0000000000000000000000000000000000000002",
						tokenAddress: TOKEN_ADDRESS,
						chainId: 56,
						cloudAgentId,
						thresholdMode: "strict_gt",
					})}`,
					expiresInSeconds: 300,
					role: "user",
					success: true,
				});
				return;
			}

			if (req.method === "POST" && url.pathname.startsWith("/v2/agents/") && url.pathname.endsWith("/runtime/test")) {
				assert.equal(req.headers.authorization, "Bearer owner-token");
				writeJson(res, 200, {
					cloudAgentId,
					hasWebUiUrl: true,
					ok: true,
					running: true,
					status: { cloudAgentId, containerId, status: "running", webUiUrl: runtimeUrl },
					webUiUrl: runtimeUrl,
				});
				return;
			}

			if (req.method === "PUT" && url.pathname.startsWith("/v2/agents/") && url.pathname.endsWith("/runtime")) {
				assert.equal(req.headers.authorization, "Bearer owner-token");
				call.body = await readBody(req);
				writeJson(res, 200, {
					action: call.body.action,
					cloudAgentId,
					ok: true,
					result: null,
					runtime: { cloudAgentId, state: "live", webUiUrl: runtimeUrl },
					status: { cloudAgentId, containerId, status: "running", webUiUrl: runtimeUrl },
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/v2/webhooks/eliza-cloud/credits") {
				assert.match(req.headers["x-waifu-webhook-signature"] ?? "", /^sha256=/);
				call.body = await readBody(req);
				assert.equal(call.body.elizaCloudAgentId, cloudAgentId);
				if (call.body.event === "credits.depleted") {
					runtimeState = "suspended";
				} else if (call.body.event === "credits.topped_up") {
					runtimeState = "running";
				} else {
					writeJson(res, 400, { ok: false, error: `unexpected lifecycle event ${call.body.event}` });
					return;
				}
				writeJson(res, 202, { status: "accepted" });
				return;
			}

			writeJson(res, 404, { ok: false, error: `unhandled ${req.method} ${url.pathname}` });
		},
	};
}

describe("eliza-cloud-live-smoke CLI contract", () => {
	it("runs the direct provisioning flow against the admin API contract", async () => {
		const runtime = await startServer(async (_req, res) => {
			res.writeHead(200, { "content-type": "text/html" });
			res.end("<!doctype html><title>Eliza Cloud Agent</title>");
		});
		const apiContract = createSmokeApi(runtime.url, { mode: "direct" });
		const api = await startServer(apiContract.handler);
		try {
			const result = await runSmoke(api.url, {
				WAIFU_ELIZA_SMOKE_WALLET_KEY_REF: WALLET_KEY_REF,
			});
			assert.equal(result.code, 0, result.stderr || result.stdout);
			assert.match(result.stdout, /live smoke passed/);
			assert.match(result.stdout, /"cloudAgentId": "cloud-direct-agent"/);
			assert.deepEqual(
				apiContract.calls
					.filter((call) => call.path === "/v2/admin/agents/eliza-cloud/test-control")
					.map((call) => call.body.action),
				["status", "balance", "pause", "resume", "status", "restart", "status"],
			);
		} finally {
			await api.close();
			await runtime.close();
		}
	});

	it("runs the worker provisioning flow through enqueue and runtime-ref polling", async () => {
		const runtime = await startServer(async (_req, res) => {
			res.writeHead(200, { "content-type": "text/html" });
			res.end("<!doctype html><title>Eliza Cloud Worker Agent</title>");
		});
		const apiContract = createSmokeApi(runtime.url, { mode: "worker" });
		const api = await startServer(apiContract.handler);
		try {
			const result = await runSmoke(api.url, {
				WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1",
				WAIFU_ELIZA_SMOKE_MODE: "worker",
				WAIFU_ELIZA_SMOKE_WALLET_KEY_REF: WALLET_KEY_REF,
			});
			assert.equal(result.code, 0, result.stderr || result.stdout);
			assert.match(result.stdout, /worker provisioning enqueued jobId=job-1/);
			assert.match(result.stdout, /worker runtime ref ready/);
			assert.match(result.stdout, /"cloudAgentId": "cloud-worker-agent"/);
			assert.equal(
				apiContract.calls.some((call) => call.path === "/v2/admin/agents/eliza-cloud/test-provision"),
				false,
			);
			assert.equal(
				apiContract.calls.some((call) => call.path === "/v2/admin/agents/eliza-cloud/test-runtime-ref"),
				true,
			);
		} finally {
			await api.close();
			await runtime.close();
		}
	});

	it("runs token chat and completed top-up verification branches", async () => {
		const runtime = await startServer(async (_req, res) => {
			res.writeHead(200, { "content-type": "text/html" });
			res.end("<!doctype html><title>Eliza Cloud Chat Agent</title>");
		});
		const apiContract = createSmokeApi(runtime.url, { mode: "direct" });
		const api = await startServer(apiContract.handler);
		try {
			const result = await runSmoke(api.url, {
				WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE: "user",
				WAIFU_ELIZA_SMOKE_OWNER_BEARER: "owner-token",
				WAIFU_ELIZA_SMOKE_STEWARD_BEARER: "steward-token",
				WAIFU_ELIZA_SMOKE_TOP_UP: "1",
				WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK: "1",
				WAIFU_ELIZA_SMOKE_WALLET_KEY_REF: WALLET_KEY_REF,
				WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION: "cs_mock",
				WEBHOOK_RECEIVER_SECRET: "webhook-secret",
			});
			assert.equal(result.code, 0, result.stderr || result.stdout);
			assert.match(result.stdout, /chat-session ok role=user/);
			assert.match(result.stdout, /owner runtime test ok status=running/);
			assert.match(result.stdout, /owner runtime control ok action=status/);
			assert.match(result.stdout, /top-up checkout ok/);
			assert.match(result.stdout, /lifecycle depleted webhook ok status=suspended/);
			assert.match(result.stdout, /lifecycle topped_up webhook ok status=running/);
			assert.match(result.stdout, /top-up verification ok session=cs_mock/);
			assert.match(result.stdout, /post-top-up runtime ok status=running/);
			assert.match(result.stdout, /"chatSession": \{/);
			assert.match(result.stdout, /"role": "user"/);
			assert.match(result.stdout, /"hasChatUrl": true/);
			assert.match(result.stdout, /"ownerRuntime": \{/);
			assert.match(result.stdout, /"controlAction": "status"/);
			assert.match(result.stdout, /"controlOk": true/);
			assert.match(result.stdout, /"alreadyApplied": true/);
			assert.equal(
				apiContract.calls.some((call) => call.path === `/owner/tokens/bsc/56/${TOKEN_ADDRESS}/chat-session`),
				true,
			);
			assert.equal(
				apiContract.calls.some((call) => call.method === "POST" && call.path.endsWith("/runtime/test")),
				true,
			);
			assert.equal(
				apiContract.calls.some((call) => call.method === "PUT" && call.path.endsWith("/runtime")),
				true,
			);
			assert.deepEqual(
				apiContract.calls
					.filter((call) => call.path === "/v2/admin/agents/eliza-cloud/test-control")
					.map((call) => call.body.action),
				[
					"status",
					"balance",
					"pause",
					"resume",
					"status",
					"restart",
					"status",
					"status",
					"status",
					"top-up",
					"verify-top-up",
					"balance",
					"status",
				],
			);
		} finally {
			await api.close();
			await runtime.close();
		}
	});

	it("runs full E2E mode through worker launch, token chat, owner controls, and top-up verification", async () => {
		const runtime = await startServer(async (_req, res) => {
			res.writeHead(200, { "content-type": "text/html" });
			res.end("<!doctype html><title>Eliza Cloud Full E2E Agent</title>");
		});
		const apiContract = createSmokeApi(runtime.url, { mode: "worker" });
		const api = await startServer(apiContract.handler);
		try {
			const result = await runSmoke(api.url, {
				WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1",
				WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE: "user",
				WAIFU_ELIZA_SMOKE_MODE: "worker",
				WAIFU_ELIZA_SMOKE_OWNER_BEARER: "owner-token",
				WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E: "1",
				WAIFU_ELIZA_SMOKE_STEWARD_BEARER: "steward-token",
				WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK: "1",
				WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION: "cs_mock",
				WAIFU_ELIZA_SMOKE_WALLET_KEY_REF: WALLET_KEY_REF,
				WEBHOOK_RECEIVER_SECRET: "webhook-secret",
			});
			assert.equal(result.code, 0, result.stderr || result.stdout);
			assert.match(result.stdout, /worker provisioning enqueued jobId=job-1/);
			assert.match(result.stdout, /chat-session ok role=user/);
			assert.match(result.stdout, /owner runtime test ok status=running/);
			assert.doesNotMatch(result.stdout, /top-up checkout ok/);
			assert.match(result.stdout, /lifecycle depleted webhook ok status=suspended/);
			assert.match(result.stdout, /lifecycle topped_up webhook ok status=running/);
			assert.match(result.stdout, /top-up verification ok session=cs_mock/);
			assert.match(result.stdout, /"chatSession": \{/);
			assert.match(result.stdout, /"ownerRuntime": \{/);
			assert.match(result.stdout, /live smoke passed/);
			assert.equal(
				apiContract.calls.some((call) => call.path === "/v2/admin/agents/eliza-cloud/test-provision"),
				false,
			);
			assert.equal(
				apiContract.calls.some((call) => call.path === "/v2/admin/agents/eliza-cloud/test-enqueue-provisioning"),
				true,
			);
			assert.equal(
				apiContract.calls.some((call) => call.path === `/owner/tokens/bsc/56/${TOKEN_ADDRESS}/chat-session`),
				true,
			);
			assert.equal(
				apiContract.calls.some((call) => call.method === "POST" && call.path.endsWith("/runtime/test")),
				true,
			);
			assert.equal(
				apiContract.calls.some(
					(call) => call.path === "/v2/admin/agents/eliza-cloud/test-control" && call.body?.action === "top-up",
				),
				false,
			);
			assert.equal(
				apiContract.calls.some(
					(call) => call.path === "/v2/admin/agents/eliza-cloud/test-control" && call.body?.action === "verify-top-up",
				),
				true,
			);
			assert.equal(
				apiContract.calls.filter((call) => call.path === "/v2/webhooks/eliza-cloud/credits").length,
				2,
			);
		} finally {
			await api.close();
			await runtime.close();
		}
	});
});
