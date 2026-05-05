import { describe, expect, it } from "vitest";

import { PROVISION_RESPONSE_TIMEOUT_MS } from "./wizard-client";
import { provisionSuccessRoute, provisionSuccessStorageKey } from "./wizard-provision-success";

describe("wizard provision success routing", () => {
	it("waits longer than the backend receipt timeout before failing the wizard", () => {
		expect(PROVISION_RESPONSE_TIMEOUT_MS).toBe(300_000);
	});

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
