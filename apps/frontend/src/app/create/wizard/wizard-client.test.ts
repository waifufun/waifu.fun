import { describe, expect, it } from "vitest";

import { provisionSuccessRoute, provisionSuccessStorageKey } from "./wizard-provision-success";

describe("wizard provision success routing", () => {
	it("uses tokenAddress for patron redirect and one-time key storage when present", () => {
		const result = {
			ok: true,
			agentId: "agt_01HXinternal",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			agentApiKey: "agk_test",
		} as const;

		expect(provisionSuccessStorageKey(result)).toMatchInlineSnapshot(
			`"wf_agent_api_key:0x0000000000000000000000000000000000000004"`,
		);
		expect(provisionSuccessRoute(result)).toMatchInlineSnapshot(
			`"/patron/0x0000000000000000000000000000000000000004?just_provisioned=true"`,
		);
	});

	it("falls back to agentId for legacy duplicate-recovery payloads", () => {
		const result = { ok: true, agentId: "agt_01HXinternal", agentApiKey: "agk_test" } as const;

		expect(provisionSuccessStorageKey(result)).toBe("wf_agent_api_key:agt_01HXinternal");
		expect(provisionSuccessRoute(result)).toBe("/patron/agt_01HXinternal?just_provisioned=true");
	});
});
