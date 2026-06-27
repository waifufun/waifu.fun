import { DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ProvisionRequest,
	buildProvisionPayload,
	fetchProvisioningStatus,
	provisionAgent,
} from "./agent-provision";

type TestProvisionState = {
	inviteCode: string;
	persona: {
		name: string;
		ticker: string;
		bio: string;
		personaPrompt: string;
		avatarDataUrl: string | null;
		avatarTemplateId: string | null;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
		owners: string[];
		threshold: number;
		firstBuyFundingSource: string | null;
		adapters: { pancake: boolean; venus: boolean };
	};
	launchpad: {
		selectedId: LaunchpadId | null;
		selectedChain: ChainId | null;
		feeConfig: LaunchpadFeeConfig | null;
	};
};

function stateWithLaunchpad(): TestProvisionState {
	return {
		inviteCode: "WF-TEST1-TEST2",
		persona: {
			name: " Mika ",
			ticker: " MIKA ",
			bio: " A market-native waifu. ",
			personaPrompt: " trade carefully ",
			avatarDataUrl: null,
			avatarTemplateId: "tessera",
		},
		safe: {
			taxAgentBps: 8000,
			taxPatronBps: 2000,
			owners: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"],
			threshold: 1,
			firstBuyFundingSource: "0x2222222222222222222222222222222222222222",
			adapters: { pancake: true, venus: true },
		},
		launchpad: {
			selectedId: "four-meme-tax" as const,
			selectedChain: "bsc" as const,
			feeConfig: DEFAULT_FOUR_MEME_TAX,
		},
	};
}

describe("buildProvisionPayload", () => {
	it("preserves the legacy provision request when the launchpad picker is disabled", () => {
		const payload = buildProvisionPayload(stateWithLaunchpad(), { launchpadPickerEnabled: false });

		expect(payload).not.toHaveProperty("launchpad");
		expect(payload.inviteCode).toBe("WF-TEST1-TEST2");
		expect(payload.persona).toMatchObject({ name: "Mika", ticker: "MIKA" });
		expect(payload.runtime).toEqual({ kind: "hosted" });
		expect(payload.safe.owners).toEqual([
			"0x1111111111111111111111111111111111111111",
			"0x2222222222222222222222222222222222222222",
		]);
		expect(payload.safe.threshold).toBe(1);
		expect(payload.safe.firstBuyFundingSource).toBe("0x2222222222222222222222222222222222222222");
		expect(payload.safe.adapters).toEqual([
			{ slug: "pancake", enabled: true },
			{ slug: "venus", enabled: true },
		]);
	});

	it("adds selected launchpad, chain, and production fee config when the picker is enabled", () => {
		const payload = buildProvisionPayload(stateWithLaunchpad(), { launchpadPickerEnabled: true });

		expect(payload.launchpad).toEqual({
			launchpad_id: "four-meme-tax",
			chain: "bsc",
			launchpad_config: DEFAULT_FOUR_MEME_TAX,
			fee_mode: "production",
			fees_can_be_disabled: false,
		});
	});

	it("falls back to the known chain for drafts saved before selectedChain existed", () => {
		const oldDraft = stateWithLaunchpad();
		oldDraft.launchpad.selectedChain = null;

		const payload = buildProvisionPayload(oldDraft, { launchpadPickerEnabled: true });

		expect(payload.launchpad?.chain).toBe("bsc");
	});

	it("always sends hosted runtime in the wizard payload", () => {
		// The wizard has no BYO toggle anymore; hosted is the only path.
		// BYO users go through /give-skill, which uses the skill flow and
		// hits the provision endpoint with webhook/pull from the agent side.
		const payload = buildProvisionPayload(stateWithLaunchpad(), { launchpadPickerEnabled: false });

		expect(payload.runtime).toEqual({ kind: "hosted" });
	});
});

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const MINIMAL_PROVISION_REQUEST: ProvisionRequest = {
	inviteCode: "WF-TEST",
	persona: {
		name: "Mika",
		ticker: "MIKA",
		bio: "bio",
		personaPrompt: "prompt",
		avatarTemplateId: "tessera",
		hasAvatarUpload: false,
	},
	runtime: { kind: "hosted" },
	safe: {
		taxAgentBps: 8000,
		taxPatronBps: 2000,
		owners: ["0x1111111111111111111111111111111111111111"],
		threshold: 1,
		firstBuyFundingSource: null,
		adapters: [{ slug: "pancake", enabled: true }],
	},
};

describe("provisionAgent 202 async handling", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("treats a 202 with status='provisioning' as ok and flags asyncProvisioning", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse(
				{
					agentId: "agt_async",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					safeAddress: "0x0000000000000000000000000000000000000003",
					agentApiKey: "agk_key",
					status: "provisioning",
					cloudStatus: "provisioning",
					provisioningJobId: "provision:agt_async:agent-provisioning",
				},
				202,
			),
		);

		const result = await provisionAgent(MINIMAL_PROVISION_REQUEST);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok");
		expect(result.asyncProvisioning).toBe(true);
		expect(result.cloudStatus).toBe("provisioning");
		expect(result.provisioningJobId).toBe("provision:agt_async:agent-provisioning");
		expect(result.agentApiKey).toBe("agk_key");
	});

	it("does NOT flag asyncProvisioning for a 200 duplicate-recovery response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse(
				{
					agentId: "agt_dup",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					safeAddress: "0x0000000000000000000000000000000000000003",
					agentApiKey: "agk_rotated",
					cloudAgentId: "cloud-existing",
					cloudStatus: "running",
					webUiUrl: "https://agent.example",
				},
				200,
			),
		);

		const result = await provisionAgent(MINIMAL_PROVISION_REQUEST);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok");
		expect(result.asyncProvisioning).toBeUndefined();
		expect(result.cloudStatus).toBe("running");
		expect(result.webUiUrl).toBe("https://agent.example");
	});
});

describe("fetchProvisioningStatus", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports ready when the runtime is running AND has a reachable chat URL", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse(
				{
					agentId: "agt_ready",
					elizaCloudAgentId: "cloud-1",
					metadata: { provisioning: { status: "running", webUiUrl: "https://agent.example" } },
				},
				200,
			),
		);

		const snap = await fetchProvisioningStatus("agt_ready");
		expect(snap.ready).toBe(true);
		expect(snap.failed).toBe(false);
		expect(snap.cloudStatus).toBe("running");
		expect(snap.webUiUrl).toBe("https://agent.example");
	});

	it("is NOT ready when running but the chat URL is missing (mirrors backend overlay gate)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse(
				{
					agentId: "agt_no_url",
					elizaCloudAgentId: "cloud-1",
					metadata: { provisioning: { status: "running" } },
				},
				200,
			),
		);

		const snap = await fetchProvisioningStatus("agt_no_url");
		expect(snap.ready).toBe(false);
		expect(snap.cloudStatus).toBe("running");
	});

	it("reports failed on a terminal failed status", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse(
				{
					agentId: "agt_failed",
					elizaCloudAgentId: "cloud-1",
					metadata: { provisioning: { status: "failed" } },
				},
				200,
			),
		);

		const snap = await fetchProvisioningStatus("agt_failed");
		expect(snap.failed).toBe(true);
		expect(snap.ready).toBe(false);
	});

	it("never throws on a transient fetch error (returns a non-terminal snapshot)", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
		const snap = await fetchProvisioningStatus("agt_blip");
		expect(snap).toEqual({ cloudStatus: null, webUiUrl: null, ready: false, failed: false });
	});
});
