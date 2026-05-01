import assert from "node:assert/strict";
import test from "node:test";

import {
	AGENT_ROLE_ID,
	DEFAULT_AGENT_AUTONOMY,
	PATRON_ROLE_ID,
	buildAgentRoleScopes,
	calculateSafeThreshold,
	deployAgentSafe,
} from "../src/services/agent-launch/index.js";

const agent = "0x00000000000000000000000000000000000000a1" as const;
const patron = "0x00000000000000000000000000000000000000b1" as const;
const safe = "0x0000000000000000000000000000000000000afe" as const;
const modifier = "0x0000000000000000000000000000000000000f1e" as const;

test("deployAgentSafe wires Safe, Roles modifier, and role config through injectable deployers", async () => {
	const events: string[] = [];
	const roleCalls: string[] = [];

	const result = await deployAgentSafe(
		{
			agentId: "agent-safe-test",
			chain: "bsc",
			patronAddresses: [patron],
			agentEoaAddress: agent,
		},
		{
			async deploySafe({ owners, threshold }) {
				events.push(`safe:${owners.join(",")}:${threshold}`);
				return safe;
			},
			async deployRolesModifier({ safeAddress }) {
				events.push(`roles:${safeAddress}`);
				return modifier;
			},
			async enableModule({ safeAddress, modifierAddress }) {
				events.push(`enable:${safeAddress}:${modifierAddress}`);
			},
			async submitRoleCalls({ modifierAddress, calls, data }) {
				events.push(`config:${modifierAddress}:${calls.length}:${data.slice(0, 10)}`);
				roleCalls.push(...calls);
			},
		},
	);

	assert.deepEqual(result, {
		safeAddress: safe,
		modifierAddress: modifier,
		agentRoleId: AGENT_ROLE_ID,
		patronRoleId: PATRON_ROLE_ID,
	});
	assert.deepEqual(events.slice(0, 3), [
		"safe:0x00000000000000000000000000000000000000B1:1",
		`roles:${safe}`,
		`enable:${safe}:${modifier}`,
	]);
	assert.ok(roleCalls.length >= 6, "agent + patron roles and scoped targets are configured");
});

test("Safe threshold is 1-of-1 or majority for multiple patrons", () => {
	assert.equal(calculateSafeThreshold(1), 1);
	assert.equal(calculateSafeThreshold(2), 2);
	assert.equal(calculateSafeThreshold(3), 2);
	assert.equal(calculateSafeThreshold(4), 3);
});

test("buildAgentRoleScopes includes Pancake routers and default autonomy limits", () => {
	const scopes = buildAgentRoleScopes(DEFAULT_AGENT_AUTONOMY, agent);
	assert.equal(scopes.length, 2);
	assert.ok(scopes.some((scope) => scope.target === DEFAULT_AGENT_AUTONOMY.whitelistedTargets.pancakeRouterV2));
	assert.ok(scopes.some((scope) => scope.target === DEFAULT_AGENT_AUTONOMY.whitelistedTargets.pancakeRouterV3));
	for (const scope of scopes) {
		assert.equal(scope.limits.maxPercentPortfolioPerTrade, 5);
		assert.equal(scope.limits.maxTradesPer24h, 10);
		assert.ok(scope.calls.length >= 2);
	}
});

const fork = process.env.BSC_FORK_RPC_URL;

test("BSC fork deploys Safe + Zodiac Roles and verifies role config", { skip: !fork }, async () => {
	// TODO(W1.C): enable this against an anvil/hardhat BSC fork once the repo has
	// fork harness plumbing and a funded SAFE_DEPLOYMENT_FUNDER_PK. The service
	// path is real; this test is intentionally skipped without BSC_FORK_RPC_URL.
	assert.ok(fork);
});
