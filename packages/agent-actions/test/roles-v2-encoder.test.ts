import { describe, expect, it } from "bun:test";
import { decodeFunctionData, keccak256, toBytes } from "viem";

import { pancakeV3Spec } from "../src/adapters/pancakeswap-v3/spec.js";
import { venusSpec } from "../src/adapters/venus/spec.js";
import {
	ZODIAC_ROLES_V2_ABI,
	ZodiacRolesV2ExecutionOptions,
	buildZodiacRolesV2Config,
} from "../src/zodiac/roles-v2-encoder.js";

const ROLE_KEY = keccak256(toBytes("waifu.agent.default-role"));
const AGENT = "0x1111111111111111111111111111111111111111" as const;
const MODULE = "0x2222222222222222222222222222222222222222" as const;

describe("Zodiac Roles v2 encoder", () => {
	it("emits canonical assignRoles then scoped default-tier adapter calls", () => {
		const config = buildZodiacRolesV2Config({
			adapters: [pancakeV3Spec, venusSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});

		expect(config.calls.length).toBe(25);
		expect(config.permissions[0]).toMatchObject({
			adapterSlug: "pancakeswap-v3",
			actionName: "quote",
			selector: "0xc6a5026a",
		});
		expect(config.permissions).toHaveLength(12);
		expect(
			config.permissions.some((permission) => permission.executionOptions === ZodiacRolesV2ExecutionOptions.Send),
		).toBe(true);
		expect(config.permissions.find((permission) => permission.selector === "0xc6a5026a")?.executionOptions).toBe(
			ZodiacRolesV2ExecutionOptions.None,
		);

		const assign = decodeFunctionData({ abi: ZODIAC_ROLES_V2_ABI, data: config.calls[0] });
		expect(assign.functionName).toBe("assignRoles");
		expect(assign.args).toEqual([AGENT, [ROLE_KEY], [true]]);

		const firstScopeTarget = decodeFunctionData({ abi: ZODIAC_ROLES_V2_ABI, data: config.calls[1] });
		expect(firstScopeTarget.functionName).toBe("scopeTarget");
		expect(firstScopeTarget.args[0]).toBe(ROLE_KEY);

		const firstScopeFunction = decodeFunctionData({ abi: ZODIAC_ROLES_V2_ABI, data: config.calls[2] });
		expect(firstScopeFunction.functionName).toBe("scopeFunction");
		expect(firstScopeFunction.args[2]).toBe("0xc6a5026a");
		expect(firstScopeFunction.args[3]).toEqual([]);
		expect(firstScopeFunction.args[4]).toBe(ZodiacRolesV2ExecutionOptions.None);
	});

	it("excludes opt-in swap, redeem, and borrow from launch default policy", () => {
		const config = buildZodiacRolesV2Config({
			adapters: [pancakeV3Spec, venusSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});
		const includedActions = new Set(
			config.permissions.map((permission) => `${permission.adapterSlug}:${permission.actionName}`),
		);

		expect(includedActions.has("pancakeswap-v3:swap")).toBe(false);
		expect(includedActions.has("venus:redeem")).toBe(false);
		expect(includedActions.has("venus:borrow")).toBe(false);
		expect(includedActions.has("pancakeswap-v3:quote")).toBe(true);
		expect(includedActions.has("venus:supply")).toBe(true);
		expect(config.permissions.some((permission) => permission.selector === "0x095ea7b3")).toBe(false);
	});

	it("is deterministic and can include opt-in actions only when explicitly requested", () => {
		const a = buildZodiacRolesV2Config({
			adapters: [venusSpec, pancakeV3Spec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});
		const b = buildZodiacRolesV2Config({
			adapters: [venusSpec, pancakeV3Spec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});
		expect(a.calls).toEqual(b.calls);

		const all = buildZodiacRolesV2Config({
			adapters: [pancakeV3Spec, venusSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
			policy: "all",
		});
		const allActions = new Set(
			all.permissions.map((permission) => `${permission.adapterSlug}:${permission.actionName}`),
		);
		expect(allActions.has("pancakeswap-v3:swap")).toBe(true);
		expect(allActions.has("venus:redeem")).toBe(true);
		expect(allActions.has("venus:borrow")).toBe(true);
		expect(all.permissions.some((permission) => permission.selector === "0x095ea7b3")).toBe(true);
	});
});

describe("Zodiac Roles v2 encoder value caps", () => {
	it("encodes refillable ether allowances for value caps", () => {
		const cappedSpec = {
			slug: "capped",
			name: "Capped",
			chains: [56],
			tier: "default",
			contracts: { target: "0x3333333333333333333333333333333333333333" },
			actions: {
				pay: {
					name: "pay",
					label: "Pay",
					description: "Pay with capped native value",
					permissions: [
						{
							label: "Pay target",
							target: "0x3333333333333333333333333333333333333333",
							selectors: ["0x12345678"],
							maxValuePerTx: 10n,
							maxValuePerDay: 100n,
						},
					],
					cost: { gasEstimate: 1n },
				},
			},
		} as const;

		const config = buildZodiacRolesV2Config({
			adapters: [cappedSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});
		expect(config.permissions[0].conditions).toHaveLength(3);
		expect(config.permissions[0].conditions[0].operator).toBe(1);
		expect(config.permissions[0].allowanceCalls).toHaveLength(2);

		const perTxAllowance = decodeFunctionData({
			abi: ZODIAC_ROLES_V2_ABI,
			data: config.permissions[0].allowanceCalls[0],
		});
		expect(perTxAllowance.functionName).toBe("setAllowance");
		expect(perTxAllowance.args.slice(1)).toEqual([10n, 10n, 10n, 1n, 0n]);

		const perDayAllowance = decodeFunctionData({
			abi: ZODIAC_ROLES_V2_ABI,
			data: config.permissions[0].allowanceCalls[1],
		});
		expect(perDayAllowance.args.slice(1)).toEqual([100n, 100n, 100n, 86_400n, 0n]);
	});
});
