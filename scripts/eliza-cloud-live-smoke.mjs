#!/usr/bin/env node

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function usage() {
	console.log(`Usage:
  WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1 \\
  WAIFU_API_BASE_URL=http://localhost:3001 \\
  ADMIN_API_KEY=... \\
  WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS=0x... \\
  WAIFU_ELIZA_SMOKE_AGENT_WALLET=0x... \\
  node scripts/eliza-cloud-live-smoke.mjs

Optional:
  WAIFU_ELIZA_SMOKE_MODE=direct|worker
  WAIFU_ELIZA_SMOKE_ADMIN_WALLET=0x...
  WAIFU_ELIZA_SMOKE_CONTAINER_IMAGE_URI=registry/image:tag
  WAIFU_ELIZA_SMOKE_PROJECT_NAME=waifu-live-smoke
  WAIFU_ELIZA_SMOKE_AGENT_ID=waifu-live-smoke-...
  WAIFU_ELIZA_SMOKE_WAIT_SECONDS=180
  WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1
  WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1
  WAIFU_ELIZA_SMOKE_STEWARD_BEARER=steward-jwt-for-token-chat-session
  WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE=admin|user|guest
  WAIFU_ELIZA_SMOKE_TOP_UP=1
  WAIFU_ELIZA_SMOKE_TOP_UP_CENTS=500
`);
}

function env(name, fallback = "") {
	return process.env[name]?.trim() || fallback;
}

function requireEnv(name) {
	const value = env(name);
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function requireAddress(name) {
	const value = requireEnv(name);
	if (!EVM_ADDRESS_RE.test(value)) throw new Error(`${name} must be an EVM address`);
	return value;
}

function maybeAddress(name, fallback) {
	const value = env(name, fallback);
	if (value && !EVM_ADDRESS_RE.test(value)) throw new Error(`${name} must be an EVM address`);
	return value;
}

function apiBaseUrl() {
	return env("WAIFU_API_BASE_URL", env("NEXT_PUBLIC_API_URL", DEFAULT_API_BASE_URL)).replace(/\/+$/, "");
}

function assert(condition, message, details) {
	if (!condition) {
		const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
		throw new Error(`${message}${suffix}`);
	}
}

async function request(path, { method = "GET", body } = {}) {
	return apiRequest(path, {
		method,
		body,
		bearer: requireEnv("ADMIN_API_KEY"),
	});
}

async function apiRequest(path, { method = "GET", body, bearer } = {}) {
	const { response, json } = await apiRequestRaw(path, { method, body, bearer });
	if (!response.ok || json?.ok === false) {
		throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(json, null, 2)}`);
	}
	return json;
}

async function apiRequestRaw(path, { method = "GET", body, bearer } = {}) {
	const response = await fetch(`${apiBaseUrl()}${path}`, {
		method,
		headers: {
			...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
			...(body ? { "content-type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const text = await response.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(`${method} ${path} returned non-JSON ${response.status}: ${text.slice(0, 500)}`);
	}
	return { response, json, text };
}

async function control(action, ids, extra = {}) {
	const json = await request("/v2/admin/agents/eliza-cloud/test-control", {
		method: "POST",
		body: { action, ...ids, ...extra },
	});
	return json.data;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function runtimeStatusText(status) {
	return String(status?.status ?? status?.state ?? "").toLowerCase();
}

function runtimeUrl(status) {
	return status?.containerUrl ?? status?.webUiUrl ?? status?.url ?? null;
}

function isRunningStatus(status) {
	const value = runtimeStatusText(status);
	return ["running", "ready", "online", "active", "started"].includes(value);
}

function normalizeAddress(value) {
	return typeof value === "string" ? value.toLowerCase() : "";
}

function accountEvidence(result) {
	const account = result?.account ?? result?.accountProvisioning ?? null;
	const wallet = result?.walletProvisioning ?? null;
	const primaryWalletAddress = account?.primaryWalletAddress ?? wallet?.address ?? wallet?.clientAddress ?? null;
	return {
		account,
		wallet,
		primaryWalletAddress,
		isNewAccount: account?.isNewAccount ?? null,
		initialFreeCreditsUsd: account?.initialFreeCreditsUsd ?? null,
	};
}

function assertWalletAccountEvidence(result, agentEvmAddress) {
	const evidence = accountEvidence(result);
	assert(
		evidence.account || evidence.wallet,
		"Provision response did not expose wallet/account provisioning metadata",
		result,
	);
	assert(evidence.primaryWalletAddress, "Provision response did not expose the account primary wallet", result);
	assert(
		normalizeAddress(evidence.primaryWalletAddress) === normalizeAddress(agentEvmAddress),
		`Provision response primary wallet mismatch: expected ${agentEvmAddress}, got ${evidence.primaryWalletAddress}`,
		result,
	);
	if (evidence.isNewAccount === true) {
		assert(
			Number(evidence.initialFreeCreditsUsd) === 5,
			"New Eliza Cloud wallet account did not report $5 initial free credit",
			result,
		);
	}
	console.log(
		`[eliza-cloud-smoke] account ok primaryWallet=${evidence.primaryWalletAddress} isNew=${evidence.isNewAccount ?? "unknown"} initialFreeCredit=${evidence.initialFreeCreditsUsd ?? "unknown"}`,
	);
	return evidence;
}

async function waitForRuntime(ids) {
	const waitSeconds = Number(env("WAIFU_ELIZA_SMOKE_WAIT_SECONDS", "180"));
	assert(Number.isFinite(waitSeconds) && waitSeconds > 0, "WAIFU_ELIZA_SMOKE_WAIT_SECONDS must be positive");
	const deadline = Date.now() + waitSeconds * 1000;
	let attempt = 0;
	let lastStatus = null;

	while (Date.now() < deadline) {
		attempt += 1;
		const data = await control("status", ids);
		lastStatus = data?.status ?? null;
		const statusText = runtimeStatusText(lastStatus) || "unknown";
		const url = runtimeUrl(lastStatus);
		console.log(`[eliza-cloud-smoke] status attempt=${attempt} status=${statusText} url=${url ?? "none"}`);
		if (isRunningStatus(lastStatus)) return lastStatus;
		await sleep(Math.min(10_000, 1_000 * attempt));
	}

	throw new Error(`Runtime did not become running within ${waitSeconds}s: ${JSON.stringify(lastStatus, null, 2)}`);
}

async function waitForRuntimeRef(agentId) {
	const waitSeconds = Number(env("WAIFU_ELIZA_SMOKE_WAIT_SECONDS", "180"));
	assert(Number.isFinite(waitSeconds) && waitSeconds > 0, "WAIFU_ELIZA_SMOKE_WAIT_SECONDS must be positive");
	const deadline = Date.now() + waitSeconds * 1000;
	let attempt = 0;
	let lastBody = null;

	while (Date.now() < deadline) {
		attempt += 1;
		const { response, json } = await apiRequestRaw(
			`/v2/admin/agents/eliza-cloud/test-runtime-ref?agentId=${encodeURIComponent(agentId)}`,
			{ bearer: requireEnv("ADMIN_API_KEY") },
		);
		lastBody = json;
		if (response.ok && json?.data?.cloudAgentId) {
			console.log(
				`[eliza-cloud-smoke] worker runtime ref ready attempt=${attempt} cloudAgentId=${json.data.cloudAgentId}`,
			);
			return json.data;
		}
		if (response.status === 404) {
			throw new Error(
				`Worker runtime ref failed; agent row not found for ${agentId}: ${JSON.stringify(json, null, 2)}`,
			);
		}
		if (response.status !== 409) {
			throw new Error(`Worker runtime ref failed ${response.status}: ${JSON.stringify(json, null, 2)}`);
		}
		console.log(`[eliza-cloud-smoke] worker runtime ref pending attempt=${attempt}`);
		await sleep(Math.min(10_000, 1_000 * attempt));
	}

	throw new Error(
		`Worker runtime ref did not become ready within ${waitSeconds}s: ${JSON.stringify(lastBody, null, 2)}`,
	);
}

async function probeRuntimeUrl(url) {
	if (!url) return;
	const response = await fetch(url, { method: "GET" });
	assert(response.status < 500, `Runtime URL returned ${response.status}`, { url });
	console.log(`[eliza-cloud-smoke] runtime url reachable status=${response.status}`);
}

async function verifyTokenChatSession(input) {
	const bearer = env("WAIFU_ELIZA_SMOKE_STEWARD_BEARER");
	if (!bearer) {
		console.log(
			"[eliza-cloud-smoke] chat-session skipped; set WAIFU_ELIZA_SMOKE_STEWARD_BEARER to verify token chat access",
		);
		return null;
	}

	const path = `/owner/tokens/${encodeURIComponent(input.chain)}/${input.chainId}/${input.tokenContractAddress}/chat-session`;
	const json = await apiRequest(path, { bearer });
	assert(json?.success === true, "chat-session response did not succeed", json);
	assert(
		typeof json.chatUrl === "string" && json.chatUrl.includes("waifu_access_token="),
		"chatUrl missing waifu token",
		json,
	);
	assert(["admin", "user", "guest"].includes(json.role), "chat-session returned invalid role", json);

	const expectedRole = env("WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE");
	if (expectedRole)
		assert(json.role === expectedRole, `chat-session role mismatch: expected ${expectedRole}, got ${json.role}`, json);

	console.log(`[eliza-cloud-smoke] chat-session ok role=${json.role} expires=${json.expiresInSeconds}s`);
	await probeRuntimeUrl(json.chatUrl);
	return json;
}

async function enqueueWorkerProvisioning(input) {
	if (env("WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER") !== "1") return null;
	const json = await request("/v2/admin/agents/eliza-cloud/test-enqueue-provisioning", {
		method: "POST",
		body: {
			agentId: input.agentId,
			tokenContractAddress: input.tokenContractAddress,
			chain: input.chain,
			chainId: input.chainId,
			tokenName: input.tokenName,
			tokenTicker: input.tokenTicker,
			agentEvmAddress: input.agentEvmAddress,
			adminWallet: input.adminWallet,
			containerImageUri: input.containerImageUri,
			source: "agent.graduated",
			dryRun: env("WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN") === "1",
		},
	});
	assert(json?.data?.jobId, "worker enqueue did not return a job id", json);
	console.log(
		`[eliza-cloud-smoke] worker provisioning ${json.data.enqueued ? "enqueued" : "dry-run"} jobId=${json.data.jobId}`,
	);
	return json.data;
}

async function main() {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		usage();
		return;
	}

	assert(
		env("WAIFU_ELIZA_CLOUD_LIVE_SMOKE") === "1",
		"Refusing to create live Eliza Cloud resources. Set WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1.",
	);

	const tokenContractAddress = requireAddress("WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS");
	const agentEvmAddress = requireAddress("WAIFU_ELIZA_SMOKE_AGENT_WALLET");
	const adminWallet = maybeAddress("WAIFU_ELIZA_SMOKE_ADMIN_WALLET", agentEvmAddress);
	const agentId = env("WAIFU_ELIZA_SMOKE_AGENT_ID", `waifu-live-smoke-${Date.now().toString(36)}`);
	const amountUsdCents = Number(env("WAIFU_ELIZA_SMOKE_TOP_UP_CENTS", "500"));
	const mode = env("WAIFU_ELIZA_SMOKE_MODE", "direct");
	assert(mode === "direct" || mode === "worker", "WAIFU_ELIZA_SMOKE_MODE must be direct or worker");
	const enqueueWorker = env("WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER") === "1";
	const enqueueDryRun = env("WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN") === "1";
	if (mode === "worker") {
		assert(enqueueWorker, "WAIFU_ELIZA_SMOKE_MODE=worker requires WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1");
		assert(!enqueueDryRun, "WAIFU_ELIZA_SMOKE_MODE=worker cannot use WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1");
	} else if (enqueueWorker && !enqueueDryRun) {
		throw new Error(
			"Refusing to enqueue a real worker provisioning job and then direct-provision the same agent. Use WAIFU_ELIZA_SMOKE_MODE=worker or set WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1.",
		);
	}

	console.log(`[eliza-cloud-smoke] api=${apiBaseUrl()}`);
	console.log(`[eliza-cloud-smoke] mode=${mode}`);
	const status = await request("/v2/admin/agents/eliza-cloud/status");
	assert(status.data?.ready, "Eliza Cloud admin readiness failed", status.data);
	console.log("[eliza-cloud-smoke] readiness ok");

	const provisionBody = {
		agentId,
		tokenContractAddress,
		chain: "bsc",
		chainId: 56,
		tokenName: env("WAIFU_ELIZA_SMOKE_TOKEN_NAME", "Waifu Live Smoke"),
		tokenTicker: env("WAIFU_ELIZA_SMOKE_TOKEN_TICKER", "WSMOKE"),
		name: env("WAIFU_ELIZA_SMOKE_CHARACTER_NAME", "Waifu Live Smoke"),
		bio: env("WAIFU_ELIZA_SMOKE_BIO", "End-to-end Eliza Cloud live smoke test."),
		agentEvmAddress,
		adminWallet,
		...(env("WAIFU_ELIZA_SMOKE_CONTAINER_IMAGE_URI")
			? { containerImageUri: env("WAIFU_ELIZA_SMOKE_CONTAINER_IMAGE_URI") }
			: {}),
		...(env("WAIFU_ELIZA_SMOKE_PROJECT_NAME") ? { projectName: env("WAIFU_ELIZA_SMOKE_PROJECT_NAME") } : {}),
	};

	let result;
	if (mode === "worker") {
		await enqueueWorkerProvisioning(provisionBody);
		result = await waitForRuntimeRef(agentId);
	} else {
		await enqueueWorkerProvisioning(provisionBody);
		const provision = await request("/v2/admin/agents/eliza-cloud/test-provision", {
			method: "POST",
			body: provisionBody,
		});
		result = provision.data;
	}
	assert(result?.cloudAgentId, "Provision response did not include cloudAgentId", result);
	const evidence = assertWalletAccountEvidence(result, agentEvmAddress);
	console.log(
		`[eliza-cloud-smoke] provision ok cloudAgentId=${result.cloudAgentId} containerId=${result.containerId ?? "none"} status=${result.status ?? "unknown"}`,
	);

	const ids = {
		cloudAgentId: result.cloudAgentId,
		...(result.containerId ? { containerId: result.containerId } : {}),
	};

	const runtime = await waitForRuntime(ids);
	await probeRuntimeUrl(runtimeUrl(runtime));
	await verifyTokenChatSession({
		chain: provisionBody.chain,
		chainId: provisionBody.chainId,
		tokenContractAddress,
	});

	const balance = await control("balance", ids);
	assert(
		balance?.balance && typeof balance.balance.balance === "number",
		"Balance control did not return organization credit balance",
		balance,
	);
	console.log(`[eliza-cloud-smoke] balance ok ${JSON.stringify(balance.balance)}`);

	const pause = await control("pause", ids);
	assert(pause?.result !== undefined, "Pause control did not return a result", pause);
	console.log("[eliza-cloud-smoke] pause ok");

	const resume = await control("resume", ids);
	assert(resume?.result !== undefined, "Resume control did not return a result", resume);
	console.log("[eliza-cloud-smoke] resume ok");

	const restart = await control("restart", ids);
	assert(restart?.result !== undefined, "Restart control did not return a result", restart);
	console.log("[eliza-cloud-smoke] restart ok");

	if (env("WAIFU_ELIZA_SMOKE_TOP_UP") === "1") {
		assert(Number.isFinite(amountUsdCents) && amountUsdCents > 0, "WAIFU_ELIZA_SMOKE_TOP_UP_CENTS must be positive");
		const topUp = await control("top-up", ids, { amountUsdCents });
		assert(topUp?.checkout, "Top-up control did not return checkout data", topUp);
		console.log(`[eliza-cloud-smoke] top-up checkout ok ${JSON.stringify(topUp.checkout)}`);
	}

	console.log("[eliza-cloud-smoke] live smoke passed");
	console.log(
		JSON.stringify(
			{
				agentId,
				cloudAgentId: result.cloudAgentId,
				containerId: runtime?.containerId ?? result.containerId ?? null,
				containerUrl: runtimeUrl(runtime) ?? result.containerUrl ?? null,
				status: runtimeStatusText(runtime) || result.status,
				polling: result.polling ?? null,
				account: evidence.account ?? null,
				walletProvisioning: evidence.wallet ?? null,
			},
			null,
			2,
		),
	);
}

main().catch((err) => {
	console.error(`[eliza-cloud-smoke] ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
});
