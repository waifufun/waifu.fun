/**
 * Unit tests for the hero narrative helpers. These exist because the
 * lede/status/stat copy IS the redesign: regressions here are visible to
 * every visitor on day one and need to be caught before they ship.
 */
import { describe, expect, it } from "vitest";

import type { AgentLaunchHeroSlice } from "./agent-hero-v2";
import { buildLede, buildSignatureStat, buildStatusMoment } from "./hero-copy";
import type { AgentData } from "./types";

const ACTIVE_AGENT: AgentData = {
	tokenAddress: "0xdEad0000000000000000000000000000000074E5",
	name: "sora rin",
	ticker: "SORA",
	status: "active",
	lastActionAt: Date.now() - 1000 * 60 * 47,
};

const ACTIVE_LAUNCH: AgentLaunchHeroSlice = {
	tier: 90,
	creator: "0x73",
	agentSafe: "0x62",
	taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
	state: "launched",
	launchTimestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 9,
	closeTimestamp: null,
	depositorCount: 12,
};

describe("buildLede", () => {
	it("post-curve agent gets a 'days post-curve' lede that names them", () => {
		const lede = buildLede({ agent: ACTIVE_AGENT, launch: ACTIVE_LAUNCH });
		expect(lede).toBeTruthy();
		expect(lede).toMatch(/days post-curve/);
		expect(lede).toMatch(/sora/);
		expect(lede).toMatch(/65%/);
	});

	it("open vault gets a deadline + agent take", () => {
		const launch: AgentLaunchHeroSlice = {
			...ACTIVE_LAUNCH,
			state: "open",
			launchTimestamp: null,
			closeTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 18,
			depositorCount: 0,
		};
		const lede = buildLede({ agent: ACTIVE_AGENT, launch });
		expect(lede).toMatch(/vault opens with/);
		expect(lede).toMatch(/1[78]h/);
	});

	it("graduated agent leads with days since graduation", () => {
		const agent: AgentData = { ...ACTIVE_AGENT, status: "graduated" };
		const launch: AgentLaunchHeroSlice = {
			...ACTIVE_LAUNCH,
			launchTimestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 41,
		};
		const lede = buildLede({ agent, launch });
		expect(lede).toMatch(/days past graduation/);
		expect(lede).toMatch(/65%/);
	});

	it("returns null when agent has a description so we don't repeat", () => {
		const agent: AgentData = { ...ACTIVE_AGENT, description: "a market making agent" };
		expect(buildLede({ agent, launch: null })).toBeNull();
	});

	it("contains no em-dashes (style discipline)", () => {
		const lede = buildLede({ agent: ACTIVE_AGENT, launch: ACTIVE_LAUNCH });
		expect(lede?.includes("\u2014")).toBe(false);
	});
});

describe("buildStatusMoment", () => {
	it("active agent reads 'online' with day + patron + last move chips", () => {
		const moment = buildStatusMoment({ agent: ACTIVE_AGENT, launch: ACTIVE_LAUNCH });
		expect(moment.state).toBe("online");
		expect(moment.parts.some((p) => p.startsWith("day"))).toBe(true);
		expect(moment.parts.some((p) => p.includes("patron"))).toBe(true);
		expect(moment.parts.some((p) => p.startsWith("last move"))).toBe(true);
	});

	it("graduated agent leads with 'graduated'", () => {
		const agent: AgentData = { ...ACTIVE_AGENT, status: "graduated" };
		const moment = buildStatusMoment({ agent, launch: ACTIVE_LAUNCH });
		expect(moment.state).toBe("graduated");
	});

	it("open vault shows a 'closes in' chip not a day counter", () => {
		const launch: AgentLaunchHeroSlice = {
			...ACTIVE_LAUNCH,
			state: "open",
			launchTimestamp: null,
			closeTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
		};
		const moment = buildStatusMoment({ agent: ACTIVE_AGENT, launch });
		expect(moment.parts.some((p) => p.startsWith("closes in"))).toBe(true);
	});
});

describe("buildSignatureStat", () => {
	it("open vault picks the countdown as the signature stat", () => {
		const launch: AgentLaunchHeroSlice = {
			...ACTIVE_LAUNCH,
			state: "open",
			launchTimestamp: null,
			closeTimestamp: Math.floor(Date.now() / 1000) + 60 * 60 * 18,
		};
		const stat = buildSignatureStat({ agent: ACTIVE_AGENT, launch });
		expect(stat?.label).toBe("vault closes in");
		expect(stat?.value).toMatch(/1[78]h/);
	});

	it("graduated picks agent's take with the accent tone (only earned-attention state lights up)", () => {
		const agent: AgentData = { ...ACTIVE_AGENT, status: "graduated" };
		const stat = buildSignatureStat({ agent, launch: ACTIVE_LAUNCH });
		expect(stat?.label).toBe("agent's take");
		expect(stat?.value).toMatch(/65%/);
		expect(stat?.tone).toBe("accent");
	});

	it("post-curve falls back to a day counter", () => {
		const stat = buildSignatureStat({ agent: ACTIVE_AGENT, launch: ACTIVE_LAUNCH });
		expect(stat?.label).toBe("post-curve");
		expect(stat?.value).toMatch(/day \d/);
	});

	it("returns null when there's literally nothing to say", () => {
		const minimal: AgentData = { tokenAddress: "0x0", name: "x", ticker: "X", status: "active" };
		const stat = buildSignatureStat({ agent: minimal, launch: null });
		expect(stat).toBeNull();
	});
});
