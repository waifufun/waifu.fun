import { describe, expect, it } from "vitest";
import { DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { buildProvisionPayload } from "./agent-provision";

type TestProvisionState = {
	persona: {
		name: string;
		ticker: string;
		bio: string;
		personaPrompt: string;
		avatarDataUrl: string | null;
		avatarTemplateId: string | null;
	};
	runtime: {
		kind: "hosted" | "webhook" | "pull";
		webhookUrl: string;
		webhookSecret: string;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
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
		persona: {
			name: " Mika ",
			ticker: " MIKA ",
			bio: " A market-native waifu. ",
			personaPrompt: " trade carefully ",
			avatarDataUrl: null,
			avatarTemplateId: "tessera",
		},
		runtime: {
			kind: "hosted" as const,
			webhookUrl: "",
			webhookSecret: "",
		},
		safe: {
			taxAgentBps: 8000,
			taxPatronBps: 2000,
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
		expect(payload.persona).toMatchObject({ name: "Mika", ticker: "MIKA" });
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
});
