import type { IToken } from "@waifufun/types";
import { describe, expect, it } from "vitest";

import { canAgentStatusChat, getPublicAgentSnapshot, tokenChatHref } from "./agent-panel.helpers";

function token(overrides: Partial<IToken> = {}): IToken {
	return {
		contractAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		name: "Chat Waifu",
		ticker: "CHAT",
		image: "/waifus/default.png",
		description: "",
		price: 0,
		totalSupply: 0,
		marketcap: 0,
		volume24h: 0,
		decimals: 18,
		holders: 0,
		status: "active",
		curveProgress: 100,
		featured: false,
		imported: false,
		socials: {},
		version: 1,
		hidden: false,
		verified: false,
		curveCompleted: true,
		...overrides,
	} as IToken;
}

describe("agent panel hosted chat helpers", () => {
	it("links token controls to the role-gated hosted chat page", () => {
		expect(tokenChatHref(token())).toBe("/token/bsc/56/0x0000000000000000000000000000000000000004/chat");
	});

	it("treats running cloud runtime metadata as a public chatable agent", () => {
		expect(
			getPublicAgentSnapshot(
				token({
					agentStatus: "running",
					cloudAgentId: "cloud-agent-1",
				} as Partial<IToken>),
			),
		).toEqual({ hasAgent: true, status: "running", lifecycle: null, canChat: true });
	});

	it("maps dormant lifecycle to stopped so depleted-credit shutdowns stay visible", () => {
		expect(
			getPublicAgentSnapshot(
				token({
					agentStatus: "none",
					agentLifecycleState: "dormant",
				} as Partial<IToken>),
			),
		).toEqual({ hasAgent: true, status: "stopped", lifecycle: "dormant", canChat: false });
	});

	it("keeps chat closed while the cloud runtime is still provisioning", () => {
		expect(
			getPublicAgentSnapshot(
				token({
					agentLifecycleState: "birth",
					cloudAgentId: "cloud-agent-1",
				} as Partial<IToken>),
			),
		).toEqual({ hasAgent: true, status: "provisioning", lifecycle: "birth", canChat: false });
	});

	it("uses the same running-only readiness rule for creator and public chat links", () => {
		expect(canAgentStatusChat("running")).toBe(true);
		expect(canAgentStatusChat(" RUNNING ")).toBe(true);
		expect(canAgentStatusChat("provisioning")).toBe(false);
		expect(canAgentStatusChat("stopped")).toBe(false);
		expect(canAgentStatusChat("suspended")).toBe(false);
		expect(canAgentStatusChat(null)).toBe(false);
	});
});
