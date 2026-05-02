import type { AdapterPermission, AdapterSpec } from "@waifufun/agent-actions";
import { type Address, type Hex, concatHex, encodeFunctionData, parseAbi } from "viem";

export interface AdapterPolicy {
	adapterSlug: string;
	enabled: boolean;
	dailyValueCapWei: string | null;
	perTxValueCapWei: string | null;
	allowedActions: string[];
	deniedActions: string[];
}

export interface RoleConfig {
	calls: Hex[];
	calldata: Hex;
	permissions: AdapterPermission[];
}

const ROLES_ABI = parseAbi([
	// TODO verify exact Zodiac Roles value-scope function signatures before mainnet submission.
	"function allowTarget(address target,uint16 roleKey)",
	"function scopeFunction(address target,bytes4 selector,bool allowed)",
]);

export function translatePolicyToRoles(policies: AdapterPolicy[], specs: AdapterSpec[]): RoleConfig {
	const specBySlug = new Map(specs.map((spec) => [spec.slug, spec]));
	const permissions: AdapterPermission[] = [];

	for (const policy of policies) {
		if (!policy.enabled) continue;
		const spec = specBySlug.get(policy.adapterSlug);
		if (!spec) continue;

		const allowed = new Set(policy.allowedActions);
		const denied = new Set(policy.deniedActions);
		const perTxCap = parseOptionalWei(policy.perTxValueCapWei, "perTxValueCapWei");
		const dailyCap = parseOptionalWei(policy.dailyValueCapWei, "dailyValueCapWei");

		for (const [actionName, action] of Object.entries(spec.actions)) {
			if (allowed.size > 0 && !allowed.has(actionName)) continue;
			if (denied.has(actionName)) continue;

			for (const permission of action.permissions) {
				permissions.push({
					...permission,
					selectors: [...permission.selectors],
					...(perTxCap !== null ? { maxValuePerTx: perTxCap } : {}),
					...(dailyCap !== null ? { maxValuePerDay: dailyCap } : {}),
				});
			}
		}
	}

	return buildPolicyRoleConfig(permissions);
}

function buildPolicyRoleConfig(permissions: AdapterPermission[]): RoleConfig {
	const calls = permissions.flatMap((permission) => [
		encodeFunctionData({
			abi: ROLES_ABI,
			functionName: "allowTarget",
			args: [normalizeAddress(permission.target), 1],
		}),
		...permission.selectors.map((selector) =>
			encodeFunctionData({
				abi: ROLES_ABI,
				functionName: "scopeFunction",
				args: [normalizeAddress(permission.target), selectorToBytes4(selector), true],
			}),
		),
	]);

	return { calls, calldata: calls.length === 0 ? "0x" : concatHex(calls), permissions };
}

function parseOptionalWei(value: string | null, field: string): bigint | null {
	if (value === null) return null;
	if (!/^\d+$/.test(value)) throw new Error(`invalid ${field}: ${value}`);
	return BigInt(value);
}

function normalizeAddress(address: string): Address {
	return address.toLowerCase() as Address;
}

function selectorToBytes4(selector: Hex): `0x${string}` {
	if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
		throw new Error(`invalid function selector: ${selector}`);
	}
	return selector;
}
