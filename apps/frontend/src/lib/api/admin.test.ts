import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ADMIN_TOKEN_KEY,
	type AdminElizaCloudStatus,
	type AdminElizaCloudTestControlInput,
	type AdminElizaCloudTestProofResult,
	type AdminElizaCloudTestResult,
	clearAdminToken,
	getAdminToken,
	requestElizaCloudHostedChatApi,
	requestElizaCloudOwnerRuntimeControl,
	requestElizaCloudOwnerRuntimeTest,
	requestElizaCloudTestProof,
	requestElizaCloudTokenChatSession,
	setAdminToken,
} from "./admin";

function makeStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => data.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			data.delete(key);
		}),
	};
}

describe("admin token storage", () => {
	afterEach(() => {
		clearAdminToken();
		vi.unstubAllGlobals();
	});

	it("stores new admin tokens in sessionStorage, not localStorage", () => {
		const sessionStorage = makeStorage();
		const localStorage = makeStorage();
		vi.stubGlobal("window", { sessionStorage, localStorage });

		setAdminToken("wf_admin_secret");

		expect(sessionStorage.setItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY, "wf_admin_secret");
		expect(localStorage.setItem).not.toHaveBeenCalled();
		expect(getAdminToken()).toBe("wf_admin_secret");
	});

	it("migrates a legacy localStorage token into sessionStorage and removes the persistent copy", () => {
		const sessionStorage = makeStorage();
		const localStorage = makeStorage({ [ADMIN_TOKEN_KEY]: "legacy_secret" });
		vi.stubGlobal("window", { sessionStorage, localStorage });

		expect(getAdminToken()).toBe("legacy_secret");
		expect(sessionStorage.setItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY, "legacy_secret");
		expect(localStorage.removeItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY);
	});
});

describe("eliza cloud admin api helpers", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("requests token chat sessions with the supplied Steward bearer and token scope", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(url).toBe("/owner/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session");
			expect(headers.get("Authorization")).toBe("Bearer steward-token");
			expect(headers.get("Accept")).toBe("application/json");
			return new Response(
				JSON.stringify({
					chatUrl: "https://agent.elizacloud.ai/chat?waifu_access_token=jwt",
					expiresInSeconds: 300,
					role: "user",
					success: true,
				}),
				{ headers: { "content-type": "application/json" }, status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			requestElizaCloudTokenChatSession({
				bearer: "steward-token",
				chain: "bsc",
				chainId: 56,
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
			}),
		).resolves.toMatchObject({ role: "user", success: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("verifies hosted Eliza chat API access with the waifu token", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(url).toBe("https://agent.elizacloud.ai/api/conversations");
			expect(init?.method).toBe("GET");
			expect(headers.get("Authorization")).toBe("Bearer jwt");
			expect(headers.get("Accept")).toBe("application/json");
			return new Response(JSON.stringify({ conversations: [] }), {
				headers: { "content-type": "application/json" },
				status: 200,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			requestElizaCloudHostedChatApi({
				chatUrl: "https://agent.elizacloud.ai/chat?waifu_access_token=jwt",
			}),
		).resolves.toEqual({
			ok: true,
			status: 200,
			url: "https://agent.elizacloud.ai/api/conversations",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("requests owner runtime checks with the supplied Steward bearer", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(url).toBe("/v2/agents/waifu-runtime-1/runtime/test");
			expect(init?.method).toBe("POST");
			expect(headers.get("Authorization")).toBe("Bearer owner-token");
			expect(headers.get("Accept")).toBe("application/json");
			return new Response(
				JSON.stringify({
					cloudAgentId: "cloud-agent-1",
					hasWebUiUrl: true,
					ok: true,
					running: true,
					webUiUrl: "https://agent.elizacloud.ai",
				}),
				{ headers: { "content-type": "application/json" }, status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			requestElizaCloudOwnerRuntimeTest({
				agentId: "waifu-runtime-1",
				bearer: "owner-token",
			}),
		).resolves.toMatchObject({ cloudAgentId: "cloud-agent-1", hasWebUiUrl: true, ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("requests owner runtime control with an action body", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(url).toBe("/v2/agents/waifu-runtime-1/runtime");
			expect(init?.method).toBe("PUT");
			expect(headers.get("Authorization")).toBe("Bearer owner-token");
			expect(headers.get("Content-Type")).toBe("application/json");
			expect(JSON.parse(String(init?.body))).toEqual({ action: "restart" });
			return new Response(
				JSON.stringify({
					action: "restart",
					cloudAgentId: "cloud-agent-1",
					ok: true,
				}),
				{ headers: { "content-type": "application/json" }, status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			requestElizaCloudOwnerRuntimeControl({
				action: "restart",
				agentId: "waifu-runtime-1",
				bearer: "owner-token",
			}),
		).resolves.toMatchObject({ action: "restart", cloudAgentId: "cloud-agent-1", ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("types Eliza Cloud account wallet key references in test results", () => {
		const result = {
			ok: true,
			data: {
				agentId: "waifu-admin-test",
				cloudAgentId: "cloud-agent-1",
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000009",
					walletKeyRef: "steward:waifu-admin-test",
					initialFreeCreditsUsd: 5,
				},
			},
		} satisfies AdminElizaCloudTestResult;

		expect(result.data?.account?.walletKeyRef).toBe("steward:waifu-admin-test");
	});

	it("types Eliza Cloud credit lifecycle test controls", () => {
		const depleted = {
			action: "webhook-depleted",
			agentId: "waifu-admin-test",
			cloudAgentId: "cloud-agent-1",
		} satisfies AdminElizaCloudTestControlInput;
		const toppedUp = {
			action: "webhook-topped-up",
			agentId: "waifu-admin-test",
			cloudAgentId: "cloud-agent-1",
			sessionId: "cs_admin_test",
		} satisfies AdminElizaCloudTestControlInput;

		expect(depleted.action).toBe("webhook-depleted");
		expect(toppedUp.action).toBe("webhook-topped-up");
	});

	it("types Eliza Cloud readiness lifecycle webhook checks", () => {
		const status = {
			ok: true,
			data: {
				ready: false,
				baseUrl: "https://elizacloud.ai",
				checks: {
					serviceAuth: true,
					containerImage: true,
					chatAccessSecret: true,
					webhookUrl: false,
					webhookSecret: true,
					database: true,
					testPageEnabled: true,
				},
				missing: ["webhookUrl"],
				productionGate: null,
			},
		} satisfies AdminElizaCloudStatus;

		expect(status.data?.checks.webhookUrl).toBe(false);
	});

	it("requests the backend Eliza Cloud proof endpoint with a bonded worker payload", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(url).toBe("/v2/admin/agents/eliza-cloud/test-proof");
			expect(init?.method).toBe("POST");
			expect(headers.get("Authorization")).toBe("Bearer admin-token");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				agentId: "waifu-proof",
				source: "agent.bonded",
				verifyLifecycle: true,
			});
			return new Response(
				JSON.stringify({
					ok: true,
					data: {
						ready: true,
						dryRun: false,
						jobId: "proof-job",
						steps: [{ key: "agent.bonded", state: "passed" }],
					},
				} satisfies AdminElizaCloudTestProofResult),
				{ headers: { "content-type": "application/json" }, status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			requestElizaCloudTestProof("admin-token", {
				agentId: "waifu-proof",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				source: "agent.bonded",
				verifyLifecycle: true,
			}),
		).resolves.toMatchObject({ data: { jobId: "proof-job", ready: true } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
