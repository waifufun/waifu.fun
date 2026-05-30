import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
	__resetSmokeEnvStateForTest,
	apiBaseUrl,
	deriveAddressFromPrivateKey,
	isDormantStatus,
	isRunningStatus,
	resolveAgentWalletAddress,
	runtimeStatusText,
	runtimeUrl,
	smokeInputErrors,
	smokeInputHelp,
} from "./eliza-cloud-live-smoke.mjs";

const SMOKE_ENV_KEYS = [
	"ADMIN_API_KEY",
	"NEXT_PUBLIC_API_URL",
	"WAIFU_API_BASE_URL",
	"WAIFU_ELIZA_SMOKE_ADMIN_WALLET",
	"WAIFU_ELIZA_SMOKE_AGENT_WALLET",
	"WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY",
	"WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN",
	"WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER",
	"WAIFU_ELIZA_SMOKE_ENV_FILE",
	"WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE",
	"WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET",
	"WAIFU_ELIZA_SMOKE_MODE",
	"WAIFU_ELIZA_SMOKE_OWNER_BEARER",
	"WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION",
	"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E",
	"WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS",
	"WAIFU_ELIZA_SMOKE_TOP_UP",
	"WAIFU_ELIZA_SMOKE_TOP_UP_CENTS",
	"WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK",
	"WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION",
	"WAIFU_ELIZA_SMOKE_WALLET_KEY_REF",
	"WAIFU_ELIZA_SMOKE_WAIT_SECONDS",
	"WEBHOOK_RECEIVER_SECRET",
];

const BASE_ENV = {
	ADMIN_API_KEY: "admin-key",
	WAIFU_ELIZA_SMOKE_AGENT_WALLET: "0x0000000000000000000000000000000000000009",
	WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000004",
};

function withSmokeEnv(values, fn) {
	const previous = new Map(SMOKE_ENV_KEYS.map((key) => [key, process.env[key]]));
	for (const key of SMOKE_ENV_KEYS) {
		delete process.env[key];
	}
	Object.assign(process.env, values);
	__resetSmokeEnvStateForTest();
	try {
		return fn();
	} finally {
		for (const key of SMOKE_ENV_KEYS) {
			const value = previous.get(key);
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
		__resetSmokeEnvStateForTest();
	}
}

afterEach(() => {
	__resetSmokeEnvStateForTest();
});

describe("eliza-cloud-live-smoke preflight", () => {
	it("reports required env before creating live resources", () => {
		withSmokeEnv({}, () => {
			assert.deepEqual(smokeInputErrors(), [
				"ADMIN_API_KEY is required",
				"WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS is required",
				"WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY is required",
			]);

			assert.match(smokeInputHelp(smokeInputErrors()), /Env files loaded by this process: none/);
		});
	});

	it("rejects invalid EVM addresses", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_ADMIN_WALLET: "not-an-address",
				WAIFU_ELIZA_SMOKE_AGENT_WALLET: "0x1234",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_AGENT_WALLET must be an EVM address",
					"WAIFU_ELIZA_SMOKE_ADMIN_WALLET must be an EVM address",
				]);
			},
		);
	});

	it("can derive the smoke agent wallet from an EVM private key", () => {
		withSmokeEnv(
			{
				ADMIN_API_KEY: "admin-key",
				WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY:
					"0x0000000000000000000000000000000000000000000000000000000000000001",
				WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000004",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), []);
				assert.equal(resolveAgentWalletAddress(), "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
				assert.equal(
					deriveAddressFromPrivateKey("0x0000000000000000000000000000000000000000000000000000000000000001"),
					"0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
				);
			},
		);
	});

	it("can generate an ephemeral smoke agent wallet locally", () => {
		withSmokeEnv(
			{
				ADMIN_API_KEY: "admin-key",
				WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET: "1",
				WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000004",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), []);
				const first = resolveAgentWalletAddress();
				const second = resolveAgentWalletAddress();
				assert.match(first, /^0x[0-9a-f]{40}$/);
				assert.equal(second, first);
			},
		);
	});

	it("rejects ambiguous generated wallet smoke inputs", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET: "1",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET cannot be combined with WAIFU_ELIZA_SMOKE_AGENT_WALLET or WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY",
				]);
				assert.throws(() => resolveAgentWalletAddress(), /cannot be combined/);
			},
		);

		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET: "yes",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), ["WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET must be 0 or 1"]);
				assert.throws(() => resolveAgentWalletAddress(), /must be 0 or 1/);
			},
		);
	});

	it("rejects invalid or mismatched EVM private key smoke inputs", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY: "0x1234",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), ["WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY must be an EVM private key"]);
			},
		);

		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY:
					"0x0000000000000000000000000000000000000000000000000000000000000001",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_AGENT_WALLET does not match WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY",
				]);
			},
		);
	});

	it("rejects correctly-shaped but invalid EVM private-key scalars", () => {
		for (const privateKey of [
			"0x0000000000000000000000000000000000000000000000000000000000000000",
			`0x${"f".repeat(64)}`,
		]) {
			withSmokeEnv(
				{
					ADMIN_API_KEY: "admin-key",
					WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY: privateKey,
					WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000004",
				},
				() => {
					assert.deepEqual(smokeInputErrors(), [
						"WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY must be a valid EVM private key",
					]);
					assert.throws(() => resolveAgentWalletAddress(), /valid EVM private key/);
				},
			);
		}
	});

	it("prevents direct mode from also enqueueing a real worker job", () => {
		withSmokeEnv({ ...BASE_ENV, WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1" }, () => {
			assert.deepEqual(smokeInputErrors(), [
				"Direct mode refuses a real worker enqueue; use WAIFU_ELIZA_SMOKE_MODE=worker or set WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1",
			]);
		});
	});

	it("allows direct mode worker dry-run validation", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN: "1",
				WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), []);
			},
		);
	});

	it("requires worker mode to enqueue a non-dry-run worker job", () => {
		withSmokeEnv({ ...BASE_ENV, WAIFU_ELIZA_SMOKE_MODE: "worker" }, () => {
			assert.deepEqual(smokeInputErrors(), [
				"WAIFU_ELIZA_SMOKE_MODE=worker requires WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1",
			]);
		});

		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN: "1",
				WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1",
				WAIFU_ELIZA_SMOKE_MODE: "worker",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_MODE=worker cannot use WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1",
				]);
			},
		);
	});

	it("validates timing, top-up, and expected chat role inputs", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE: "owner",
				WAIFU_ELIZA_SMOKE_TOP_UP: "yes",
				WAIFU_ELIZA_SMOKE_TOP_UP_CENTS: "0",
				WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK: "yes",
				WAIFU_ELIZA_SMOKE_WAIT_SECONDS: "-1",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_TOP_UP must be 0 or 1",
					"WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK must be 0 or 1",
					"WAIFU_ELIZA_SMOKE_WAIT_SECONDS must be positive",
					"WAIFU_ELIZA_SMOKE_TOP_UP_CENTS must be positive",
					"WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE must be admin, user, or guest",
				]);
			},
		);
	});

	it("requires webhook secret when lifecycle webhook verification is enabled", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK: "1",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1 requires WEBHOOK_RECEIVER_SECRET",
				]);
			},
		);
	});

	it("requires all live proof inputs in full E2E mode", () => {
		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E: "1",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), [
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_MODE=worker",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_STEWARD_BEARER",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_OWNER_BEARER",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION",
					"WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1 requires WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1",
				]);
			},
		);

		withSmokeEnv(
			{
				...BASE_ENV,
				WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER: "1",
				WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE: "admin",
				WAIFU_ELIZA_SMOKE_MODE: "worker",
				WAIFU_ELIZA_SMOKE_OWNER_BEARER: "owner-token",
				WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E: "1",
				WAIFU_ELIZA_SMOKE_STEWARD_BEARER: "steward-token",
				WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK: "1",
				WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION: "cs_mock",
				WEBHOOK_RECEIVER_SECRET: "webhook-secret",
			},
			() => {
				assert.deepEqual(smokeInputErrors(), []);
			},
		);
	});
});

describe("eliza-cloud-live-smoke runtime helpers", () => {
	it("prefers the public Eliza web UI URL over lower-level container URLs", () => {
		assert.equal(
			runtimeUrl({
				containerUrl: "https://container.internal",
				url: "https://fallback.example",
				webUiUrl: "https://agent.elizacloud.ai",
			}),
			"https://agent.elizacloud.ai",
		);
		assert.equal(runtimeUrl({ containerUrl: "https://container.example" }), "https://container.example");
		assert.equal(runtimeUrl(null), null);
	});

	it("normalizes running-like statuses", () => {
		assert.equal(runtimeStatusText({ state: "READY" }), "ready");
		assert.equal(isRunningStatus({ status: "online" }), true);
		assert.equal(isRunningStatus({ status: "suspended" }), false);
		assert.equal(isDormantStatus({ status: "suspended" }), true);
	});

	it("normalizes API base URL with fallback ordering", () => {
		withSmokeEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4321///" }, () => {
			assert.equal(apiBaseUrl(), "http://localhost:4321");
		});

		withSmokeEnv({ WAIFU_API_BASE_URL: "http://localhost:3002/", NEXT_PUBLIC_API_URL: "http://localhost:4321" }, () => {
			assert.equal(apiBaseUrl(), "http://localhost:3002");
		});
	});
});
