import assert from "node:assert/strict";
import test from "node:test";

import { pancakeV3Spec, venusSpec } from "@waifufun/agent-actions";

import { type AdapterPolicy, translatePolicyToRoles } from "./policy-to-roles.js";

const policy = (overrides: Partial<AdapterPolicy> & Pick<AdapterPolicy, "adapterSlug">) => ({
	enabled: true,
	dailyValueCapWei: null,
	perTxValueCapWei: null,
	allowedActions: [],
	deniedActions: [],
	...overrides,
});

test("translatePolicyToRoles maps enabled Pancake actions to selectors with per-tx cap", () => {
	const roles = translatePolicyToRoles(
		[
			policy({
				adapterSlug: "pancakeswap-v3",
				perTxValueCapWei: "100000000000000000",
				allowedActions: ["swap"],
			}),
			policy({ adapterSlug: "venus", enabled: false }),
		],
		[pancakeV3Spec, venusSpec],
	);

	assert.equal(roles.permissions.length, 1);
	assert.equal(roles.permissions[0]?.label, "PancakeSwap v3 exactInputSingle");
	assert.deepEqual(roles.permissions[0]?.selectors, ["0x04e45aaf"]);
	assert.equal(roles.permissions[0]?.maxValuePerTx, 100000000000000000n);
	assert.equal(roles.calls.length, 2);
});

test("translatePolicyToRoles applies Venus daily cap and denied actions", () => {
	const roles = translatePolicyToRoles(
		[
			policy({
				adapterSlug: "venus",
				dailyValueCapWei: "10000000000000000000",
				deniedActions: ["borrow", "accountLiquidity"],
			}),
		],
		[pancakeV3Spec, venusSpec],
	);

	assert.ok(roles.permissions.length > 0);
	assert.equal(
		roles.permissions.every((permission) => permission.maxValuePerDay === 10000000000000000000n),
		true,
	);
	assert.equal(
		roles.permissions.some((permission) => permission.selectors.includes("0xc5ebeaec")),
		false,
	);
});
