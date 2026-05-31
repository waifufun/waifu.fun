#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createECDH, createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const EVM_PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const loadedEnvFiles = [];
let missingExplicitEnvFile = null;
let generatedAgentPrivateKey = null;

function usage() {
	console.log(`Usage:
  WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1 \\
  WAIFU_API_BASE_URL=http://localhost:3001 \\
  ADMIN_API_KEY=... \\
  WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS=0x... \\
  WAIFU_ELIZA_SMOKE_AGENT_WALLET=0x... \\
  node scripts/eliza-cloud-live-smoke.mjs [--full-e2e]

Optional:
  --full-e2e # same as WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1
  WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 # fail fast unless worker, chat, owner control, and top-up verification inputs are present
  WAIFU_ELIZA_SMOKE_MODE=direct|worker
  WAIFU_ELIZA_SMOKE_ENV_FILE=.env.staging
  WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY=0x... # derives WAIFU_ELIZA_SMOKE_AGENT_WALLET when omitted
  WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET=1 # generates an ephemeral local private key/address for staging smoke
  WAIFU_ELIZA_SMOKE_ADMIN_WALLET=0x...
  WAIFU_ELIZA_SMOKE_WALLET_KEY_REF=steward:agent-key
  WAIFU_ELIZA_SMOKE_CONTAINER_IMAGE_URI=registry/image:tag
  WAIFU_ELIZA_SMOKE_PROJECT_NAME=waifu-live-smoke
  WAIFU_ELIZA_SMOKE_AGENT_ID=waifu-live-smoke-...
  WAIFU_ELIZA_SMOKE_WAIT_SECONDS=180
  WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1
  WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1
  WAIFU_ELIZA_SMOKE_STEWARD_BEARER=steward-jwt-for-token-chat-session
  WAIFU_ELIZA_SMOKE_OWNER_BEARER=steward-jwt-for-agent-owner-runtime-api
  WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE=admin|user|guest
  WAIFU_ELIZA_SMOKE_TOP_UP=1 # create a checkout; use 0 with VERIFY_TOP_UP_SESSION for verify-only reruns
  WAIFU_ELIZA_SMOKE_TOP_UP_CENTS=500
  WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION=cs_...
  WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1 # sign depleted/topped_up webhooks and verify shutdown/restart
  WEBHOOK_RECEIVER_SECRET=... # same value configured on the API process
`);
}

function env(name, fallback = "") {
	return process.env[name]?.trim() || fallback;
}

function flagEnabled(flag) {
	return process.argv.includes(flag);
}

function requireFullE2e() {
	return flagEnabled("--full-e2e") || env("WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E", "0") === "1";
}

function ownerRuntimeAction() {
	return env("WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION", requireFullE2e() ? "restart" : "status");
}

function loadSmokeEnvFiles() {
	const explicit = process.env.WAIFU_ELIZA_SMOKE_ENV_FILE?.trim();
	const files = [explicit, ".env.local", ".env", "apps/api/.env"].filter(Boolean);
	for (const file of files) {
		if (!existsSync(file)) {
			if (file === explicit) missingExplicitEnvFile = file;
			continue;
		}
		loadedEnvFiles.push(file);
		const content = readFileSync(file, "utf8");
		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#") || !line.includes("=")) continue;
			const index = line.indexOf("=");
			const key = line.slice(0, index).trim().replace(/^export\s+/, "");
			if (!key || process.env[key] !== undefined) continue;
			let value = line.slice(index + 1).trim();
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			process.env[key] = value;
		}
	}
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

function maybeAgentPrivateKey() {
	const value = env("WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY");
	if (!value) return null;
	if (!EVM_PRIVATE_KEY_RE.test(value)) throw new Error("WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY must be an EVM private key");
	return value;
}

function shouldGenerateAgentWallet() {
	const value = env("WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET", "0");
	if (value !== "0" && value !== "1") {
		throw new Error("WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET must be 0 or 1");
	}
	return value === "1";
}

function generateAgentPrivateKey() {
	if (generatedAgentPrivateKey) return generatedAgentPrivateKey;
	while (true) {
		const candidate = `0x${randomBytes(32).toString("hex")}`;
		try {
			deriveAddressFromPrivateKey(candidate);
			generatedAgentPrivateKey = candidate;
			return generatedAgentPrivateKey;
		} catch {
			// Try again if randomBytes produced an invalid secp256k1 scalar.
		}
	}
}

function deriveAddressFromPrivateKey(privateKey) {
	try {
		const ecdh = createECDH("secp256k1");
		ecdh.setPrivateKey(Buffer.from(privateKey.slice(2), "hex"));
		const publicKey = ecdh.getPublicKey(null, "uncompressed").subarray(1);
		const digest = keccak256(publicKey);
		return `0x${Buffer.from(digest.subarray(-20)).toString("hex")}`;
	} catch {
		throw new Error("WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY must be a valid EVM private key");
	}
}

function resolveAgentWalletAddress() {
	const explicitWallet = env("WAIFU_ELIZA_SMOKE_AGENT_WALLET");
	const privateKey = maybeAgentPrivateKey();
	const generateWallet = shouldGenerateAgentWallet();
	if (explicitWallet && !EVM_ADDRESS_RE.test(explicitWallet)) {
		throw new Error("WAIFU_ELIZA_SMOKE_AGENT_WALLET must be an EVM address");
	}
	if (generateWallet && (explicitWallet || privateKey)) {
		throw new Error(
			"WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET cannot be combined with WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY",
		);
	}
	if (generateWallet) {
		return deriveAddressFromPrivateKey(generateAgentPrivateKey());
	}
	if (!privateKey) {
		if (!explicitWallet)
			throw new Error("WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY is required");
		return explicitWallet;
	}
	const derived = deriveAddressFromPrivateKey(privateKey);
	if (explicitWallet && normalizeAddress(explicitWallet) !== normalizeAddress(derived)) {
		throw new Error("WAIFU_ELIZA_SMOKE_AGENT_WALLET does not match WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY");
	}
	return derived;
}

function smokeInputErrors() {
	const required = ["ADMIN_API_KEY", "WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS"];
	const missing = required.filter((name) => !env(name));
	const agentWallet = env("WAIFU_ELIZA_SMOKE_AGENT_WALLET");
	const agentPrivateKey = env("WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY");
	const generateWallet = env("WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET", "0");
	const mode = env("WAIFU_ELIZA_SMOKE_MODE", "direct");
	const enqueueWorker = env("WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER", "0");
	const enqueueDryRun = env("WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN", "0");
	const topUp = env("WAIFU_ELIZA_SMOKE_TOP_UP", "0");
	const requireFullE2eValue = env("WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E", "0");
	const fullE2eRequired = requireFullE2e();
	const verifyLifecycleWebhook = env("WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK", "0");
	const amountUsdCents = Number(env("WAIFU_ELIZA_SMOKE_TOP_UP_CENTS", "500"));
	const waitSeconds = Number(env("WAIFU_ELIZA_SMOKE_WAIT_SECONDS", "180"));
	const expectedRole = env("WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE");
	const runtimeAction = ownerRuntimeAction();
	const invalidAddresses = [
		"WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS",
		"WAIFU_ELIZA_SMOKE_AGENT_WALLET",
		"WAIFU_ELIZA_SMOKE_ADMIN_WALLET",
	]
		.filter((name) => env(name))
		.filter((name) => !EVM_ADDRESS_RE.test(env(name)));
	const privateKeyErrors =
		agentPrivateKey && !EVM_PRIVATE_KEY_RE.test(agentPrivateKey)
			? ["WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY must be an EVM private key"]
			: [];
	const validPrivateKeyErrors = [];
	let mismatchErrors = [];
	if (agentPrivateKey && EVM_PRIVATE_KEY_RE.test(agentPrivateKey)) {
		try {
			const derived = deriveAddressFromPrivateKey(agentPrivateKey);
			if (agentWallet && EVM_ADDRESS_RE.test(agentWallet) && normalizeAddress(agentWallet) !== normalizeAddress(derived)) {
				mismatchErrors = ["WAIFU_ELIZA_SMOKE_AGENT_WALLET does not match WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY"];
			}
		} catch (err) {
			validPrivateKeyErrors.push(err instanceof Error ? err.message : "WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY is invalid");
		}
	}
	return [
		...(missingExplicitEnvFile ? [`WAIFU_ELIZA_SMOKE_ENV_FILE does not exist: ${missingExplicitEnvFile}`] : []),
		...missing.map((name) => `${name} is required`),
		...(!agentWallet && !agentPrivateKey && generateWallet !== "1"
			? ["WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY is required"]
			: []),
		...(generateWallet === "0" || generateWallet === "1"
			? []
			: ["WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET must be 0 or 1"]),
		...(generateWallet === "1" && (agentWallet || agentPrivateKey)
			? [
					"WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET cannot be combined with WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY",
				]
			: []),
		...invalidAddresses.map((name) => `${name} must be an EVM address`),
		...privateKeyErrors,
		...validPrivateKeyErrors,
		...mismatchErrors,
		...(mode === "direct" || mode === "worker" ? [] : ["WAIFU_ELIZA_SMOKE_MODE must be direct or worker"]),
		...(enqueueWorker === "0" || enqueueWorker === "1"
			? []
			: ["WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER must be 0 or 1"]),
		...(enqueueDryRun === "0" || enqueueDryRun === "1"
			? []
			: ["WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN must be 0 or 1"]),
		...(topUp === "0" || topUp === "1" ? [] : ["WAIFU_ELIZA_SMOKE_TOP_UP must be 0 or 1"]),
		...(requireFullE2eValue === "0" || requireFullE2eValue === "1"
			? []
			: ["WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E must be 0 or 1"]),
		...(verifyLifecycleWebhook === "0" || verifyLifecycleWebhook === "1"
			? []
			: ["WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK must be 0 or 1"]),
		...(Number.isFinite(waitSeconds) && waitSeconds > 0
			? []
			: ["WAIFU_ELIZA_SMOKE_WAIT_SECONDS must be positive"]),
		...(Number.isFinite(amountUsdCents) && amountUsdCents > 0
			? []
			: ["WAIFU_ELIZA_SMOKE_TOP_UP_CENTS must be positive"]),
		...(expectedRole && !["admin", "user", "guest"].includes(expectedRole)
			? ["WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE must be admin, user, or guest"]
			: []),
		...(["status", "resume", "restart"].includes(runtimeAction)
			? []
			: ["WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION must be status, resume, or restart"]),
		...(mode === "worker" && enqueueWorker !== "1"
			? ["WAIFU_ELIZA_SMOKE_MODE=worker requires WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1"]
			: []),
		...(mode === "worker" && enqueueDryRun === "1"
			? ["WAIFU_ELIZA_SMOKE_MODE=worker cannot use WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1"]
			: []),
		...(mode === "direct" && enqueueWorker === "1" && enqueueDryRun !== "1"
			? [
					"Direct mode refuses a real worker enqueue; use WAIFU_ELIZA_SMOKE_MODE=worker or set WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1",
				]
			: []),
		...(fullE2eRequired && mode !== "worker" ? ["full E2E mode requires WAIFU_ELIZA_SMOKE_MODE=worker"] : []),
		...(fullE2eRequired && enqueueWorker !== "1"
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1"]
			: []),
		...(fullE2eRequired && !env("WAIFU_ELIZA_SMOKE_STEWARD_BEARER")
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_STEWARD_BEARER"]
			: []),
		...(fullE2eRequired && !env("WAIFU_ELIZA_SMOKE_OWNER_BEARER")
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_OWNER_BEARER"]
			: []),
		...(fullE2eRequired && !expectedRole
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE"]
			: []),
		...(fullE2eRequired && !env("WAIFU_CHAT_ACCESS_JWT_SECRET")
			? ["full E2E mode requires WAIFU_CHAT_ACCESS_JWT_SECRET"]
			: []),
		...(fullE2eRequired && !env("WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION")
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION"]
			: []),
		...(fullE2eRequired && verifyLifecycleWebhook !== "1"
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1"]
			: []),
		...(fullE2eRequired && runtimeAction === "status"
			? ["full E2E mode requires WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION=restart or resume"]
			: []),
		...(verifyLifecycleWebhook === "1" && !env("WEBHOOK_RECEIVER_SECRET")
			? ["WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1 requires WEBHOOK_RECEIVER_SECRET"]
			: []),
	];
}

function smokeInputHelp(errors) {
	const apiSideEnv = [
		"ELIZA_CLOUD_SERVICE_KEY",
		"ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI",
		"WAIFU_CHAT_ACCESS_JWT_SECRET",
		"DATABASE_URL",
		"WEBHOOK_RECEIVER_SECRET",
		"ELIZA_CLOUD_WEBHOOK_URL or WAIFU_API_BASE_URL/API_ORIGIN/NEXT_PUBLIC_API_URL",
		"WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true in production",
	];
	return [
		"Live smoke input is incomplete:",
		...errors.map((error) => `- ${error}`),
		"",
		`Env files loaded by this process: ${loadedEnvFiles.length ? loadedEnvFiles.join(", ") : "none"}`,
		`API base URL: ${apiBaseUrl()}`,
		"",
		"Also verify the API process was started with:",
		...apiSideEnv.map((name) => `- ${name}`),
	].join("\n");
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
	return status?.webUiUrl ?? status?.containerUrl ?? status?.url ?? null;
}

function base64UrlDecodeJson(segment) {
	try {
		const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
		return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
	} catch {
		return null;
	}
}

function verifyHs256JwtSignature(token, secret) {
	const [headerSegment, payloadSegment, signatureSegment] = token.split(".");
	if (!headerSegment || !payloadSegment || !signatureSegment) return false;
	const expected = createHmac("sha256", secret).update(`${headerSegment}.${payloadSegment}`).digest("base64url");
	return expected === signatureSegment;
}

function extractWaifuAccessToken(chatUrl) {
	try {
		const url = new URL(chatUrl);
		return url.searchParams.get("waifu_access_token");
	} catch {
		const match = /(?:[?&])waifu_access_token=([^&]+)/.exec(chatUrl);
		return match ? decodeURIComponent(match[1]) : null;
	}
}

function decodeWaifuAccessClaims(chatUrl) {
	const token = extractWaifuAccessToken(chatUrl);
	assert(token, "chatUrl missing waifu_access_token");
	const parts = token.split(".");
	assert(parts.length === 3, "waifu_access_token must be a JWT");
	const header = base64UrlDecodeJson(parts[0]);
	const payload = base64UrlDecodeJson(parts[1]);
	assert(header?.alg === "HS256", "waifu_access_token must use HS256", header);
	assert(payload && typeof payload === "object", "waifu_access_token payload is not valid JSON");
	const signingSecret = env("WAIFU_CHAT_ACCESS_JWT_SECRET");
	return {
		header,
		payload,
		signatureVerified: signingSecret ? verifyHs256JwtSignature(token, signingSecret) : null,
	};
}

function isRunningStatus(status) {
	const value = runtimeStatusText(status);
	return ["running", "ready", "online", "active", "started"].includes(value);
}

function isDormantStatus(status) {
	const value = runtimeStatusText(status);
	return ["dormant", "paused", "suspended", "stopped", "offline", "shutdown", "shut_down"].includes(value);
}

function __resetSmokeEnvStateForTest() {
	loadedEnvFiles.length = 0;
	missingExplicitEnvFile = null;
	generatedAgentPrivateKey = null;
}

function normalizeAddress(value) {
	return typeof value === "string" ? value.toLowerCase() : "";
}

const KECCAK_ROUND_CONSTANTS = [
	0x0000000000000001n,
	0x0000000000008082n,
	0x800000000000808an,
	0x8000000080008000n,
	0x000000000000808bn,
	0x0000000080000001n,
	0x8000000080008081n,
	0x8000000000008009n,
	0x000000000000008an,
	0x0000000000000088n,
	0x0000000080008009n,
	0x000000008000000an,
	0x000000008000808bn,
	0x800000000000008bn,
	0x8000000000008089n,
	0x8000000000008003n,
	0x8000000000008002n,
	0x8000000000000080n,
	0x000000000000800an,
	0x800000008000000an,
	0x8000000080008081n,
	0x8000000000008080n,
	0x0000000080000001n,
	0x8000000080008008n,
];
const KECCAK_ROTATION_OFFSETS = [
	0, 1, 62, 28, 27,
	36, 44, 6, 55, 20,
	3, 10, 43, 25, 39,
	41, 45, 15, 21, 8,
	18, 2, 61, 56, 14,
];
const U64_MASK = (1n << 64n) - 1n;

function rotl64(value, shift) {
	const amount = BigInt(shift);
	if (amount === 0n) return value & U64_MASK;
	return ((value << amount) | (value >> (64n - amount))) & U64_MASK;
}

function keccakF1600(state) {
	for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
		const c = new Array(5).fill(0n);
		for (let x = 0; x < 5; x++) {
			c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
		}
		for (let x = 0; x < 5; x++) {
			const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
			for (let y = 0; y < 5; y++) state[x + 5 * y] = (state[x + 5 * y] ^ d) & U64_MASK;
		}

		const b = new Array(25).fill(0n);
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				const index = x + 5 * y;
				b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[index], KECCAK_ROTATION_OFFSETS[index]);
			}
		}
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y] & U64_MASK) & b[((x + 2) % 5) + 5 * y])) & U64_MASK;
			}
		}
		state[0] = (state[0] ^ roundConstant) & U64_MASK;
	}
}

function keccak256(input) {
	const rateBytes = 136;
	const state = new Array(25).fill(0n);
	const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
	let offset = 0;
	while (offset + rateBytes <= bytes.length) {
		absorbKeccakBlock(state, bytes.subarray(offset, offset + rateBytes));
		keccakF1600(state);
		offset += rateBytes;
	}
	const block = new Uint8Array(rateBytes);
	block.set(bytes.subarray(offset));
	block[bytes.length - offset] = 0x01;
	block[rateBytes - 1] |= 0x80;
	absorbKeccakBlock(state, block);
	keccakF1600(state);

	const output = new Uint8Array(32);
	for (let i = 0; i < output.length; i++) {
		output[i] = Number((state[Math.floor(i / 8)] >> BigInt(8 * (i % 8))) & 0xffn);
	}
	return output;
}

function absorbKeccakBlock(state, block) {
	for (let lane = 0; lane < block.length / 8; lane++) {
		let value = 0n;
		for (let byte = 0; byte < 8; byte++) {
			value |= BigInt(block[lane * 8 + byte]) << BigInt(8 * byte);
		}
		state[lane] = (state[lane] ^ value) & U64_MASK;
	}
}

function accountEvidence(result) {
	const account = result?.account ?? result?.accountProvisioning ?? null;
	const wallet = result?.walletProvisioning ?? null;
	const primaryWalletAddress = account?.primaryWalletAddress ?? wallet?.address ?? wallet?.clientAddress ?? null;
	const walletKeyRef = typeof account?.walletKeyRef === "string" ? account.walletKeyRef : null;
	return {
		account,
		wallet,
		primaryWalletAddress,
		walletKeyRef,
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
	const expectedWalletKeyRef = env("WAIFU_ELIZA_SMOKE_WALLET_KEY_REF");
	if (expectedWalletKeyRef) {
		assert(
			evidence.walletKeyRef === expectedWalletKeyRef,
			`Provision response walletKeyRef mismatch: expected ${expectedWalletKeyRef}, got ${evidence.walletKeyRef ?? "missing"}`,
			result,
		);
	}
	console.log(
		`[eliza-cloud-smoke] account ok primaryWallet=${evidence.primaryWalletAddress} walletKeyRef=${evidence.walletKeyRef ?? "unknown"} isNew=${evidence.isNewAccount ?? "unknown"} initialFreeCredit=${evidence.initialFreeCreditsUsd ?? "unknown"}`,
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
		if (isRunningStatus(lastStatus) && url) return lastStatus;
		await sleep(Math.min(10_000, 1_000 * attempt));
	}

	throw new Error(
		`Runtime did not become running with a hosted web UI URL within ${waitSeconds}s: ${JSON.stringify(lastStatus, null, 2)}`,
	);
}

async function waitForRuntimeDormant(ids) {
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
		console.log(`[eliza-cloud-smoke] dormant status attempt=${attempt} status=${statusText}`);
		if (isDormantStatus(lastStatus)) return lastStatus;
		await sleep(Math.min(10_000, 1_000 * attempt));
	}

	throw new Error(`Runtime did not become dormant within ${waitSeconds}s: ${JSON.stringify(lastStatus, null, 2)}`);
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
	assert(url, "Runtime URL missing");
	const response = await fetch(url, { method: "GET" });
	assert(response.status < 500, `Runtime URL returned ${response.status}`, { url });
	console.log(`[eliza-cloud-smoke] runtime url reachable status=${response.status}`);
	return { url, status: response.status, ok: response.status < 500 };
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
	const access = decodeWaifuAccessClaims(json.chatUrl);
	assert(access.payload.iss === "waifu.fun", "waifu_access_token issuer mismatch", access.payload);
	const audience = access.payload.aud;
	assert(
		audience === "eliza-cloud-chat" || (Array.isArray(audience) && audience.includes("eliza-cloud-chat")),
		"waifu_access_token audience mismatch",
		access.payload,
	);
	assert(access.payload.role === json.role, "waifu_access_token role mismatch", access.payload);
	assert(access.payload.cloudAgentId === input.cloudAgentId, "waifu_access_token cloudAgentId mismatch", access.payload);
	assert(
		normalizeAddress(access.payload.tokenAddress) === normalizeAddress(input.tokenContractAddress),
		"waifu_access_token tokenAddress mismatch",
		access.payload,
	);
	assert(access.payload.chainId === input.chainId, "waifu_access_token chainId mismatch", access.payload);
	assert(access.payload.thresholdMode === "strict_gt", "waifu_access_token must use strict_gt thresholds", access.payload);
	if (access.signatureVerified === false) {
		throw new Error("waifu_access_token signature did not match WAIFU_CHAT_ACCESS_JWT_SECRET");
	}
	if (requireFullE2e()) {
		assert(
			access.signatureVerified === true,
			"full E2E mode requires waifu_access_token signature verification",
			access.payload,
		);
	}

	const expectedRole = env("WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE");
	if (expectedRole)
		assert(json.role === expectedRole, `chat-session role mismatch: expected ${expectedRole}, got ${json.role}`, json);

	console.log(
		`[eliza-cloud-smoke] chat-session ok role=${json.role} cloudAgentId=${access.payload.cloudAgentId} jwtSignature=${access.signatureVerified ?? "not-checked"} expires=${json.expiresInSeconds}s`,
	);
	await probeRuntimeUrl(json.chatUrl);
	return { ...json, waifuAccessToken: { ...access, header: undefined } };
}

async function verifyOwnerRuntimeApi(input) {
	const bearer = env("WAIFU_ELIZA_SMOKE_OWNER_BEARER");
	if (!bearer) {
		console.log(
			"[eliza-cloud-smoke] owner runtime API skipped; set WAIFU_ELIZA_SMOKE_OWNER_BEARER to verify /v2/agents/:id/runtime",
		);
		return null;
	}

	const runtimePath = `/v2/agents/${encodeURIComponent(input.agentId)}/runtime`;
	const test = await apiRequest(`${runtimePath}/test`, { method: "POST", bearer });
	assert(test?.cloudAgentId === input.cloudAgentId, "owner runtime test returned unexpected cloudAgentId", test);
	assert(test?.running === true || test?.ok === true, "owner runtime test did not report a running hosted runtime", test);
	assert(test?.hasWebUiUrl === true, "owner runtime test did not prove a hosted web UI URL", test);
	console.log(`[eliza-cloud-smoke] owner runtime test ok status=${runtimeStatusText(test.status) || "unknown"}`);

	const controlResult = await apiRequest(runtimePath, {
		method: "PUT",
		bearer,
		body: { action: ownerRuntimeAction() },
	});
	assert(controlResult?.cloudAgentId === input.cloudAgentId, "owner runtime control returned unexpected cloudAgentId", controlResult);
	assert(controlResult?.ok === true, "owner runtime control did not succeed", controlResult);
	console.log(`[eliza-cloud-smoke] owner runtime control ok action=${controlResult.action}`);
	return { test, control: controlResult };
}

async function verifyCompletedTopUp(ids) {
	const sessionId = env("WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION");
	if (!sessionId) {
		console.log(
			"[eliza-cloud-smoke] top-up verification skipped; set WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION to verify a completed Stripe checkout",
		);
		return null;
	}

	const data = await control("verify-top-up", ids, { sessionId });
	assert(data?.verification, "Top-up verification did not return verification data", data);
	const verification = data.verification;
	assert(
		verification.alreadyApplied === true ||
			typeof verification.balance === "number" ||
			typeof verification.amount === "number",
		"Top-up verification did not prove applied credits or existing application",
		verification,
	);
	console.log(
		`[eliza-cloud-smoke] top-up verification ok session=${sessionId} alreadyApplied=${verification.alreadyApplied ?? "unknown"} balance=${verification.balance ?? "unknown"}`,
	);

	const balance = await control("balance", ids);
	assert(
		balance?.balance && typeof balance.balance.balance === "number",
		"Balance after top-up verification did not return organization credit balance",
		balance,
	);
	console.log(`[eliza-cloud-smoke] post-top-up balance ok ${JSON.stringify(balance.balance)}`);
	const runtime = await waitForRuntime(ids);
	console.log(`[eliza-cloud-smoke] post-top-up runtime ok status=${runtimeStatusText(runtime) || "unknown"}`);
	return { verification, balance: balance.balance, runtime };
}

async function postSignedElizaCreditWebhook(payload) {
	const secret = requireEnv("WEBHOOK_RECEIVER_SECRET");
	const body = JSON.stringify(payload);
	const signature = `sha256=${createHmac("sha256", secret).update(`${payload.timestamp}.${body}`).digest("hex")}`;
	const response = await fetch(`${apiBaseUrl()}/v2/webhooks/eliza-cloud/credits`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Signature": signature,
		},
		body,
	});
	const text = await response.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(`Eliza credit webhook returned non-JSON ${response.status}: ${text.slice(0, 500)}`);
	}
	if (!response.ok) {
		throw new Error(`Eliza credit webhook failed ${response.status}: ${JSON.stringify(json, null, 2)}`);
	}
	return json;
}

async function verifyLifecycleWebhooks(ids, agentId) {
	if (env("WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK", "0") !== "1") {
		console.log(
			"[eliza-cloud-smoke] lifecycle webhook skipped; set WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1 and WEBHOOK_RECEIVER_SECRET to verify credit-driven shutdown/restart",
		);
		return null;
	}

	const basePayload = {
		agentId,
		elizaCloudAgentId: ids.cloudAgentId,
		...(ids.containerId ? { containerId: ids.containerId } : {}),
	};
	const depleted = await postSignedElizaCreditWebhook({
		...basePayload,
		event: "credits.depleted",
		eventId: `waifu-smoke-depleted-${Date.now()}`,
		timestamp: new Date().toISOString(),
		creditsRemaining: 0,
	});
	assert(depleted?.status === "accepted" || depleted?.status === "ok", "credits.depleted webhook not accepted", depleted);
	const dormantRuntime = await waitForRuntimeDormant(ids);
	console.log(`[eliza-cloud-smoke] lifecycle depleted webhook ok status=${runtimeStatusText(dormantRuntime) || "unknown"}`);

	const toppedUp = await postSignedElizaCreditWebhook({
		...basePayload,
		event: "credits.topped_up",
		eventId: `waifu-smoke-topped-up-${Date.now()}`,
		timestamp: new Date().toISOString(),
		amountUsdCents: Number(env("WAIFU_ELIZA_SMOKE_TOP_UP_CENTS", "500")),
		sessionId: env("WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION") || undefined,
	});
	assert(toppedUp?.status === "accepted" || toppedUp?.status === "ok", "credits.topped_up webhook not accepted", toppedUp);
	const runningRuntime = await waitForRuntime(ids);
	console.log(`[eliza-cloud-smoke] lifecycle topped_up webhook ok status=${runtimeStatusText(runningRuntime) || "unknown"}`);

	return { depleted, dormantRuntime, toppedUp, runningRuntime };
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
			walletKeyRef: input.walletKeyRef,
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
	const inputErrors = smokeInputErrors();
	if (inputErrors.length > 0) {
		throw new Error(smokeInputHelp(inputErrors));
	}

	const tokenContractAddress = requireAddress("WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS");
	const agentEvmAddress = resolveAgentWalletAddress();
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
		...(env("WAIFU_ELIZA_SMOKE_WALLET_KEY_REF") ? { walletKeyRef: env("WAIFU_ELIZA_SMOKE_WALLET_KEY_REF") } : {}),
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

	let runtime = await waitForRuntime(ids);
	let hostedUrlProbe = await probeRuntimeUrl(runtimeUrl(runtime));
	const chatSession = await verifyTokenChatSession({
		chain: provisionBody.chain,
		chainId: provisionBody.chainId,
		tokenContractAddress,
		cloudAgentId: result.cloudAgentId,
	});
	const ownerRuntime = await verifyOwnerRuntimeApi({ agentId, cloudAgentId: result.cloudAgentId });

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
	runtime = await waitForRuntime(ids);
	console.log(`[eliza-cloud-smoke] resume runtime ok status=${runtimeStatusText(runtime) || "unknown"}`);

	const restart = await control("restart", ids);
	assert(restart?.result !== undefined, "Restart control did not return a result", restart);
	console.log("[eliza-cloud-smoke] restart ok");
	runtime = await waitForRuntime(ids);
	console.log(`[eliza-cloud-smoke] restart runtime ok status=${runtimeStatusText(runtime) || "unknown"}`);

	const lifecycleWebhooks = await verifyLifecycleWebhooks(ids, agentId);

	let topUpVerification = null;
	if (env("WAIFU_ELIZA_SMOKE_TOP_UP") === "1") {
		assert(Number.isFinite(amountUsdCents) && amountUsdCents > 0, "WAIFU_ELIZA_SMOKE_TOP_UP_CENTS must be positive");
		const topUp = await control("top-up", ids, { amountUsdCents });
		assert(topUp?.checkout, "Top-up control did not return checkout data", topUp);
		console.log(`[eliza-cloud-smoke] top-up checkout ok ${JSON.stringify(topUp.checkout)}`);
	}
	topUpVerification = await verifyCompletedTopUp(ids);
	hostedUrlProbe = await probeRuntimeUrl(runtimeUrl(runtime));

	console.log("[eliza-cloud-smoke] live smoke passed");
	console.log(
		JSON.stringify(
			{
				agentId,
				cloudAgentId: result.cloudAgentId,
				containerId: runtime?.containerId ?? result.containerId ?? null,
				containerUrl: runtimeUrl(runtime) ?? result.containerUrl ?? null,
				webUiUrl: runtimeUrl(runtime) ?? result.webUiUrl ?? null,
				hostedUrlReachable: hostedUrlProbe?.ok ?? false,
				hostedUrlStatus: hostedUrlProbe?.status ?? null,
				status: runtimeStatusText(runtime) || result.status,
				polling: result.polling ?? null,
				account: evidence.account ?? null,
				walletProvisioning: evidence.wallet ?? null,
				chatSession: chatSession
					? {
							role: chatSession.role ?? null,
							expiresInSeconds: chatSession.expiresInSeconds ?? null,
							hasChatUrl: typeof chatSession.chatUrl === "string",
							tokenCloudAgentId: chatSession.waifuAccessToken?.payload?.cloudAgentId ?? null,
							tokenSignatureVerified: chatSession.waifuAccessToken?.signatureVerified ?? null,
						}
					: null,
				ownerRuntime: ownerRuntime
					? {
							testStatus: runtimeStatusText(ownerRuntime.test?.status) || null,
							running: ownerRuntime.test?.running ?? null,
							hasWebUiUrl: ownerRuntime.test?.hasWebUiUrl ?? null,
							controlAction: ownerRuntime.control?.action ?? null,
							controlOk: ownerRuntime.control?.ok ?? null,
						}
					: null,
				topUpVerification: topUpVerification
					? {
							alreadyApplied: topUpVerification.verification?.alreadyApplied ?? null,
							balance: topUpVerification.balance ?? null,
							status: runtimeStatusText(topUpVerification.runtime) || null,
						}
					: null,
				lifecycleWebhooks: lifecycleWebhooks
					? {
							depletedAccepted: lifecycleWebhooks.depleted?.status ?? null,
							dormantStatus: runtimeStatusText(lifecycleWebhooks.dormantRuntime) || null,
							toppedUpAccepted: lifecycleWebhooks.toppedUp?.status ?? null,
							runningStatus: runtimeStatusText(lifecycleWebhooks.runningRuntime) || null,
						}
					: null,
			},
			null,
			2,
		),
	);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
	loadSmokeEnvFiles();

	main().catch((err) => {
		console.error(`[eliza-cloud-smoke] ${err instanceof Error ? err.message : String(err)}`);
		process.exitCode = 1;
	});
}

export {
	__resetSmokeEnvStateForTest,
	apiBaseUrl,
	deriveAddressFromPrivateKey,
	isRunningStatus,
	isDormantStatus,
	loadSmokeEnvFiles,
	resolveAgentWalletAddress,
	runtimeStatusText,
	runtimeUrl,
	smokeInputErrors,
	smokeInputHelp,
};
