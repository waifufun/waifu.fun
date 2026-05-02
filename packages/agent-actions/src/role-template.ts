import { exampleNoopSpec } from "./adapters/example-noop.js";
import { pancakeV3Spec } from "./adapters/pancakeswap-v3/spec.js";
import { venusSpec } from "./adapters/venus/spec.js";
import type { AdapterImpl, AdapterPermission } from "./types.js";

export interface RoleTemplate {
	permissions: AdapterPermission[];
}

/**
 * Build a lightweight permission template from adapter specs.
 * The Zodiac Roles encoder will translate this shape into concrete role rules later.
 */
export const buildRoleTemplate = (impls: AdapterImpl[]): RoleTemplate => ({
	permissions: impls.flatMap((impl) =>
		Object.values(impl.spec.actions).flatMap((action) =>
			action.permissions.map((permission) => ({
				...permission,
				selectors: [...permission.selectors],
				label: `${impl.spec.slug}:${permission.label}`,
			})),
		),
	),
});

export const defaultRoleTemplates: Record<string, { perTxCap?: bigint; dailyCap?: bigint; enabled: boolean }> = {
	[pancakeV3Spec.slug]: {
		perTxCap: 100000000000000000n,
		enabled: true,
	},
	[venusSpec.slug]: {
		dailyCap: 10000000000000000000n,
		enabled: true,
	},
	[exampleNoopSpec.slug]: {
		enabled: false,
	},
};
