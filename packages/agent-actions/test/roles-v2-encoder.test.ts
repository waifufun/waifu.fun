import { describe, expect, it } from "bun:test";
import { decodeFunctionData, keccak256, toBytes } from "viem";

import { pancakeV3Spec } from "../src/adapters/pancakeswap-v3/spec.js";
import { venusSpec } from "../src/adapters/venus/spec.js";
import {
	ZODIAC_ROLES_V2_ABI,
	ZodiacRolesV2ExecutionOptions,
	ZodiacRolesV2Operator,
	ZodiacRolesV2ParameterType,
	buildZodiacRolesV2Config,
} from "../src/zodiac/roles-v2-encoder.js";

const ROLE_KEY = keccak256(toBytes("waifu.agent.default-role"));
const AGENT = "0x1111111111111111111111111111111111111111" as const;
const MODULE = "0x2222222222222222222222222222222222222222" as const;
const NATIVE_VALUE_CHECKER = "0x4444444444444444444444444444444444444444" as const;

describe("Zodiac Roles v2 encoder", () => {
	it("emits canonical assignRoles then scoped default-tier adapter calls", () => {
		const config = buildZodiacRolesV2Config({
			adapters: [pancakeV3Spec, venusSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
		});

		expect(config.calls.length).toBe(12);
		expect(config.permissions[0]).toMatchObject({
			adapterSlug: "pancakeswap-v3",
			actionName: "quote",
			selector: "0xc6a5026a",
		});
		expect(config.permissions).toHaveLength(11);
		expect(
			config.permissions.some((permission) => permission.executionOptions === ZodiacRolesV2ExecutionOptions.Send),
		).toBe(false);
		expect(config.permissions.find((permission) => permission.selector === "0xc6a5026a")?.executionOptions).toBe(
			ZodiacRolesV2ExecutionOptions.None,
		);

		const assign = decodeFunctionData({ abi: ZODIAC_ROLES_V2_ABI, data: config.calls[0] });
		expect(assign.functionName).toBe("assignRoles");
		expect(assign.args).toEqual([AGENT, [ROLE_KEY], [true]]);

		const firstScopeFunction = decodeFunctionData({ abi: ZODIAC_ROLES_V2_ABI, data: config.calls[1] });
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
	it("encodes a custom native-value comparator for per-tx cap and refillable allowance for daily cap", () => {
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
			policy: "all",
			nativeValueConditionChecker: NATIVE_VALUE_CHECKER,
		});
		expect(config.permissions[0].conditions).toHaveLength(3);
		expect(config.permissions[0].conditions[0].operator).toBe(ZodiacRolesV2Operator.And);
		expect(config.permissions[0].conditions[1]).toEqual({
			parent: 0,
			paramType: ZodiacRolesV2ParameterType.None,
			operator: ZodiacRolesV2Operator.Custom,
			compValue: `${NATIVE_VALUE_CHECKER}00000000000000000000000a`,
		});
		expect(config.permissions[0].allowanceCalls).toHaveLength(1);

		const perDayAllowance = decodeFunctionData({
			abi: ZODIAC_ROLES_V2_ABI,
			data: config.permissions[0].allowanceCalls[0],
		});
		expect(perDayAllowance.args.slice(1)).toEqual([100n, 100n, 100n, 86_400n, 0n]);
	});

	it("per-tx cap is evaluated per call, not as a refillable aggregate budget", () => {
		const cap = 10n;
		const customCheckerAllows = (value: bigint) => value <= cap;
		const oldAllowanceAllows = (value: bigint, elapsedSeconds: bigint) => {
			const balance = elapsedSeconds >= 1n ? cap : 0n;
			return value <= balance;
		};

		expect(customCheckerAllows(cap)).toBe(true);
		expect(customCheckerAllows(cap + 1n)).toBe(false);
		expect(customCheckerAllows(cap)).toBe(true);
		expect(oldAllowanceAllows(cap, 1n)).toBe(true);

		const cappedSpec = {
			slug: "single-cap",
			name: "Single Cap",
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
							maxValuePerTx: cap,
						},
					],
					cost: { gasEstimate: 1n },
				},
			},
		} as const;

		expect(() =>
			buildZodiacRolesV2Config({
				adapters: [cappedSpec],
				roleKey: ROLE_KEY,
				agent: AGENT,
				module: MODULE,
			}),
		).toThrow("nativeValueConditionChecker is required for maxValuePerTx");

		const config = buildZodiacRolesV2Config({
			adapters: [cappedSpec],
			roleKey: ROLE_KEY,
			agent: AGENT,
			module: MODULE,
			policy: "all",
			nativeValueConditionChecker: NATIVE_VALUE_CHECKER,
		});

		expect(config.permissions[0].allowanceCalls).toEqual([]);
		expect(config.permissions[0].conditions).toEqual([
			{
				parent: 0,
				paramType: ZodiacRolesV2ParameterType.None,
				operator: ZodiacRolesV2Operator.Custom,
				compValue: `${NATIVE_VALUE_CHECKER}00000000000000000000000a`,
			},
		]);
	});
});
