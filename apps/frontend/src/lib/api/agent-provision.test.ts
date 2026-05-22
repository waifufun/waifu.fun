import { DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { describe, expect, it } from "vitest";
import { buildProvisionPayload } from "./agent-provision";

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
