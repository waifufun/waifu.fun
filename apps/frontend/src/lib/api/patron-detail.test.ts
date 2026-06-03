import { describe, expect, it } from "vitest";

import { normalizeAgentDetail } from "./patron";

/**
 * Guards the agent-detail shape adapter (waifu permissionless-launch dry-run,
 * 2026-06-02). The raw `GET /v2/agents/:token` API response uses `symbol`,
 * the `graduated|active|pending|failed` status enum, a `state{...}` control
 * block, and `elizaCloudAgentId` — none of which match the patron-page
 * `AgentDetail` UI type (`ticker`, `provisioned|active|dormant|killed`,
 * `runtime{...}`). Casting the raw row straight to AgentDetail left those
 * fields undefined and blanked the patron page. These tests pin the mapping.
 */
describe("normalizeAgentDetail", () => {
	// Trimmed copy of the live GET /v2/agents/<WAIFU token> response shape.
	const liveRow = {
		agentId: "sol-the-architect",
		name: "Sol the Architect",
		symbol: "WAIFU",
		status: "graduated",
		state: { brainPaused: false, withdrawalsPaused: false, killed: false },
		model: "Cloud",
		framework: "ElizaOS",
		tokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
		treasuryUsd: 190546.03,
		treasuryNavUsd: 190546.03,
		avatarUrl: "https://ipfs.io/ipfs/bafy",
		elizaCloudAgentId: "4f2cb05b-82cc-4f0e-95dd-8613c336d6ce",
		agentSafeAddress: "0x440e903c5bb2c78de33d839613316d95ca2009e9",
		treasuryAddress: null,
		lastActionAt: "2026-06-03T02:08:17.132Z",
		twitterHandle: "0xSolace_",
	};

	it("maps symbol -> ticker and avatarUrl -> avatar", () => {
		const d = normalizeAgentDetail(liveRow);
		expect(d.ticker).toBe("WAIFU");
		expect(d.name).toBe("Sol the Architect");
		expect(d.avatar).toBe("https://ipfs.io/ipfs/bafy");
		expect(d.tokenAddress).toBe("0x15fc6086064afe50ccf4c70000c55cecb6e17777");
	});

	it("folds the graduated/active status enum into the live dashboard state", () => {
		expect(normalizeAgentDetail({ ...liveRow, status: "graduated" }).status).toBe("active");
		expect(normalizeAgentDetail({ ...liveRow, status: "active" }).status).toBe("active");
		expect(normalizeAgentDetail({ ...liveRow, status: "failed" }).status).toBe("active");
	});

	it("maps pending -> provisioned", () => {
		expect(normalizeAgentDetail({ ...liveRow, status: "pending", tokenAddress: null }).status).toBe("provisioned");
	});

	it("respects the control state (killed / brainPaused) over status", () => {
		expect(normalizeAgentDetail({ ...liveRow, state: { killed: true } }).status).toBe("killed");
		expect(normalizeAgentDetail({ ...liveRow, state: { brainPaused: true } }).status).toBe("dormant");
	});

	it("synthesizes an eliza-cloud runtime from elizaCloudAgentId + provisioning metadata", () => {
		const d = normalizeAgentDetail({
			...liveRow,
			metadata: { provisioning: { webUiUrl: "https://run.eliza/agent", status: "running" } },
		});
		expect(d.runtimeKind).toBe("eliza-cloud");
		expect(d.runtime?.cloudAgentId).toBe("4f2cb05b-82cc-4f0e-95dd-8613c336d6ce");
		expect(d.runtime?.webUiUrl).toBe("https://run.eliza/agent");
		expect(d.runtime?.cloudStatus).toBe("running");
	});

	it("leaves runtime null when there is no cloud agent id", () => {
		const { elizaCloudAgentId: _drop, ...noCloud } = liveRow;
		const d = normalizeAgentDetail(noCloud);
		expect(d.runtime).toBeNull();
		expect(d.runtimeKind).toBeUndefined();
	});

	it("maps safe + xHandle fallbacks", () => {
		const d = normalizeAgentDetail(liveRow);
		expect(d.safeAddress).toBe("0x440e903c5bb2c78de33d839613316d95ca2009e9");
		expect(d.xHandle).toBe("0xSolace_");
	});

	it("returns a safe empty shape for a non-object input", () => {
		const d = normalizeAgentDetail(null);
		expect(d.ticker).toBe("");
		expect(d.status).toBe("provisioned");
		expect(d.treasuryUsd).toBe(0);
	});
});
