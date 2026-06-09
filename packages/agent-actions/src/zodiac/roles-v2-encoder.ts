import type { Address, Hex } from "viem";
import { encodeFunctionData, getAddress, keccak256, parseAbi, toBytes } from "viem";

import type { AdapterAction, AdapterImpl, AdapterPermission, AdapterSpec } from "../types.js";

/**
 * Canonical Zodiac Roles Modifier v2 ABI fragments used by waifu launch policy.
 *
 * Source: @gnosis.pm/zodiac v4.0.3 RolesV2 ABI packaged in this repo and
 * zodiac-roles-deployments v3.3.0. Roles v2 uses bytes32 role keys and
 * ConditionFlat[] for scoped function conditions.
 */
export const ZODIAC_ROLES_V2_ABI = parseAbi([
	"function assignRoles(address module, bytes32[] roleKeys, bool[] memberOf)",
	"function scopeTarget(bytes32 roleKey, address targetAddress)",
	"function scopeFunction(bytes32 roleKey, address targetAddress, bytes4 selector, (uint8 parent,uint8 paramType,uint8 operator,bytes compValue)[] conditions, uint8 options)",
	"function setAllowance(bytes32 key, uint128 balance, uint128 maxRefill, uint128 refill, uint64 period, uint64 timestamp)",
]);

export enum ZodiacRolesV2ExecutionOptions {
	None = 0,
	Send = 1,
	DelegateCall = 2,
	Both = 3,
}

export enum ZodiacRolesV2ParameterType {
	None = 0,
	Static = 1,
	Dynamic = 2,
	Tuple = 3,
	Array = 4,
	Calldata = 5,
	AbiEncoded = 6,
}

export enum ZodiacRolesV2Operator {
	Pass = 0,
	And = 1,
	Or = 2,
	Matches = 5,
	ArrayEvery = 7,
	EqualToAvatar = 15,
	EqualTo = 16,
	GreaterThan = 17,
	LessThan = 18,
	SignedIntGreaterThan = 19,
	SignedIntLessThan = 20,
	Bitmask = 21,
	Custom = 22,
	WithinAllowance = 28,
	EtherWithinAllowance = 29,
	CallWithinAllowance = 30,
}

export interface ZodiacRolesV2ConditionFlat {
	parent: number;
	paramType: ZodiacRolesV2ParameterType;
	operator: ZodiacRolesV2Operator;
	compValue: Hex;
}

export interface ZodiacRolesV2EncodedPermission {
	adapterSlug: string;
	actionName: string;
	label: string;
	target: Address;
	selector: Hex;
	executionOptions: ZodiacRolesV2ExecutionOptions;
	conditions: ZodiacRolesV2ConditionFlat[];
	allowanceCalls: Hex[];
}

export interface BuildZodiacRolesV2ConfigInput {
	adapters: readonly (AdapterImpl | AdapterSpec)[];
	roleKey: Hex;
	agent: Address;
	/** Address of the Roles modifier module receiving this calldata. Kept for caller bookkeeping. */
	module: Address;
	/** Defaults to conservative launch default, excluding adapter/action opt-in permissions. */
	policy?: "default" | "all";
	/** Optional override. By default, native-value permissions use Send and all other calls use None. */
	executionOptions?: ZodiacRolesV2ExecutionOptions;
	/**
	 * Custom checker for native per-transaction value ceilings.
	 * Roles v2 has no built-in `context.value <= cap` condition, so positive
	 * maxValuePerTx policies need an ICustomCondition checker.
	 */
	nativeValueConditionChecker?: Address;
}

export interface ZodiacRolesV2Config {
	module: Address;
	agent: Address;
	roleKey: Hex;
	calls: Hex[];
	permissions: ZodiacRolesV2EncodedPermission[];
}

const DAY_SECONDS = 24 * 60 * 60;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;

export function buildZodiacRolesV2Config(input: BuildZodiacRolesV2ConfigInput): ZodiacRolesV2Config {
	const roleKey = assertBytes32(input.roleKey, "roleKey");
	const agent = getAddress(input.agent);
	const module = getAddress(input.module);
	const policy = input.policy ?? "default";
	const executionOptions = input.executionOptions;

	const permissions = collectPermissions(
		input.adapters,
		policy,
		executionOptions,
		roleKey,
		input.nativeValueConditionChecker,
	).sort(compareEncodedPermission);
	const calls = [
		encodeFunctionData({
			abi: ZODIAC_ROLES_V2_ABI,
			functionName: "assignRoles",
			args: [agent, [roleKey], [true]],
		}),
		...permissions.flatMap((permission) => [
			...permission.allowanceCalls,
			encodeFunctionData({
				abi: ZODIAC_ROLES_V2_ABI,
				functionName: "scopeTarget",
				args: [roleKey, permission.target],
			}),
			encodeFunctionData({
				abi: ZODIAC_ROLES_V2_ABI,
				functionName: "scopeFunction",
				args: [
					roleKey,
					permission.target,
					assertSelector(permission.selector),
					permission.conditions,
					permission.executionOptions,
				],
			}),
		]),
	];

	return { module, agent, roleKey, calls, permissions };
}

export function buildDefaultZodiacRolesV2Calls(
	adapters: readonly (AdapterImpl | AdapterSpec)[],
	roleKey: Hex,
	agent: Address,
	module: Address,
): Hex[] {
	return buildZodiacRolesV2Config({ adapters, roleKey, agent, module, policy: "default" }).calls;
}

function collectPermissions(
	adapters: readonly (AdapterImpl | AdapterSpec)[],
	policy: "default" | "all",
	executionOptions: ZodiacRolesV2ExecutionOptions | undefined,
	roleKey: Hex,
	nativeValueConditionChecker: Address | undefined,
): ZodiacRolesV2EncodedPermission[] {
	const out: ZodiacRolesV2EncodedPermission[] = [];
	for (const adapterLike of adapters) {
		const spec = "spec" in adapterLike ? adapterLike.spec : adapterLike;
		if (policy === "default" && spec.tier !== "default") continue;

		for (const [actionName, action] of Object.entries(spec.actions) as [string, AdapterAction][]) {
			if (policy === "default" && (action.tier ?? "default") !== "default") continue;
			for (const permission of action.permissions) {
				if (policy === "default" && (permission.tier ?? "default") !== "default") continue;
				for (const selector of permission.selectors) {
					out.push(
						encodePermission(
							spec.slug,
							actionName,
							permission,
							selector,
							executionOptions,
							roleKey,
							nativeValueConditionChecker,
						),
					);
				}
			}
		}
	}
	return out;
}

function encodePermission(
	adapterSlug: string,
	actionName: string,
	permission: AdapterPermission,
	selector: Hex,
	executionOptions: ZodiacRolesV2ExecutionOptions | undefined,
	roleKey: Hex,
	nativeValueConditionChecker: Address | undefined,
): ZodiacRolesV2EncodedPermission {
	const { allowanceCalls, conditions } = encodeValueCapConditions(
		adapterSlug,
		actionName,
		permission,
		selector,
		roleKey,
		nativeValueConditionChecker,
	);
	return {
		adapterSlug,
		actionName,
		label: permission.label,
		target: getAddress(permission.target),
		selector: assertSelector(selector),
		executionOptions: executionOptions ?? inferExecutionOptions(permission, selector),
		conditions,
		allowanceCalls,
	};
}

function encodeValueCapConditions(
	adapterSlug: string,
	actionName: string,
	permission: AdapterPermission,
	selector: Hex,
	roleKey: Hex,
	nativeValueConditionChecker: Address | undefined,
): { allowanceCalls: Hex[]; conditions: ZodiacRolesV2ConditionFlat[] } {
	const allowanceCalls: Hex[] = [];
	// Value-level conditions (per-tx Custom ceiling, per-day EtherWithinAllowance).
	// These are NOT calldata-param conditions: per Zodiac Roles v2 `Integrity` +
	// the canonical SDK `calldataMatches` encoding, they attach as `None`-typed
	// children of a `Matches(Calldata)` root. A bare root `Custom`/`And` node
	// (paramType None) is rejected at scopeFunction time because the root type
	// tree must resolve to `Calldata` (Integrity.sol: UnsuitableRootNode).
	const valueChildren: ZodiacRolesV2ConditionFlat[] = [];
	const addEtherAllowance = (kind: "per-tx" | "per-day", cap: bigint, refill: bigint, period: number) => {
		assertUint128(cap, `${kind} cap`);
		assertUint128(refill, `${kind} refill`);
		const key = allowanceKey(roleKey, adapterSlug, actionName, permission.target, selector, kind);
		allowanceCalls.push(
			encodeFunctionData({
				abi: ZODIAC_ROLES_V2_ABI,
				functionName: "setAllowance",
				args: [key, cap, cap, refill, BigInt(period), 0n],
			}),
		);
		// EtherWithinAllowance MUST be a direct child of the Calldata root
		// (Integrity.sol enforces parent.paramType == Calldata for this operator).
		valueChildren.push({
			parent: 0,
			paramType: ZodiacRolesV2ParameterType.None,
			operator: ZodiacRolesV2Operator.EtherWithinAllowance,
			compValue: key,
		});
	};

	if (permission.maxValuePerTx !== undefined) {
		valueChildren.push(nativeValueLessThanOrEqualCondition(permission.maxValuePerTx, nativeValueConditionChecker));
	}
	if (permission.maxValuePerDay !== undefined)
		addEtherAllowance("per-day", permission.maxValuePerDay, permission.maxValuePerDay, DAY_SECONDS);

	// No value constraints: wildcard the function (empty conditions).
	if (valueChildren.length === 0) {
		return { allowanceCalls, conditions: [] };
	}

	// Wrap value-level conditions under a Matches(Calldata) root so the real
	// Roles v2 module accepts the scopeFunction call and walks the conditions.
	// Children reference the root via parent index 0 (BFS order: root first).
	const conditions: ZodiacRolesV2ConditionFlat[] = [
		{
			parent: 0,
			paramType: ZodiacRolesV2ParameterType.Calldata,
			operator: ZodiacRolesV2Operator.Matches,
			compValue: "0x",
		},
		...valueChildren,
	];
	return { allowanceCalls, conditions };
}

function nativeValueLessThanOrEqualCondition(cap: bigint, checker: Address | undefined): ZodiacRolesV2ConditionFlat {
	assertUint96(cap, "per-tx cap");
	if (!checker) {
		throw new Error("nativeValueConditionChecker is required for maxValuePerTx");
	}
	const checkerAddress = getAddress(checker).slice(2).toLowerCase();
	const capExtra = cap.toString(16).padStart(24, "0");
	return {
		parent: 0,
		paramType: ZodiacRolesV2ParameterType.None,
		operator: ZodiacRolesV2Operator.Custom,
		compValue: `0x${checkerAddress}${capExtra}` as Hex,
	};
}

function allowanceKey(
	roleKey: Hex,
	adapterSlug: string,
	actionName: string,
	target: Address,
	selector: Hex,
	kind: "per-tx" | "per-day",
): Hex {
	return keccak256(
		toBytes(
			`waifu.agent-actions.${roleKey}.${kind}.${adapterSlug}.${actionName}.${getAddress(target)}.${selector.toLowerCase()}`,
		),
	);
}

function compareEncodedPermission(a: ZodiacRolesV2EncodedPermission, b: ZodiacRolesV2EncodedPermission): number {
	return (
		a.adapterSlug.localeCompare(b.adapterSlug) ||
		a.actionName.localeCompare(b.actionName) ||
		a.target.toLowerCase().localeCompare(b.target.toLowerCase()) ||
		a.selector.toLowerCase().localeCompare(b.selector.toLowerCase()) ||
		a.label.localeCompare(b.label)
	);
}

function assertSelector(selector: Hex): Hex {
	if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) throw new Error(`invalid function selector: ${selector}`);
	return selector.toLowerCase() as Hex;
}

function assertBytes32(value: Hex, label: string): Hex {
	if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32`);
	return value.toLowerCase() as Hex;
}

function assertUint128(value: bigint, label: string): void {
	if (value < 0n || value > UINT128_MAX) throw new Error(`${label} exceeds uint128`);
}

function assertUint96(value: bigint, label: string): void {
	if (value < 0n || value > UINT96_MAX) throw new Error(`${label} exceeds uint96`);
}

function inferExecutionOptions(permission: AdapterPermission, selector: Hex): ZodiacRolesV2ExecutionOptions {
	if (permission.maxValuePerTx !== undefined || permission.maxValuePerDay !== undefined)
		return ZodiacRolesV2ExecutionOptions.Send;
	if (selector.toLowerCase() === "0x1249c58b") return ZodiacRolesV2ExecutionOptions.Send;
	return ZodiacRolesV2ExecutionOptions.None;
}
