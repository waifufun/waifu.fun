import { zeroAddress } from "viem";

import { registerAdapter } from "../registry.js";
import type { AdapterImpl, AdapterSpec } from "../types.js";

export interface ExampleNoopPingInput {
	memo?: string;
}

export interface ExampleNoopPingOutput {
	hash: `0x${string}`;
}

export const exampleNoopSpec = {
	slug: "example-noop",
	name: "Example Noop",
	chains: [56],
	tier: "opt-in",
	contracts: {
		self: zeroAddress,
	},
	actions: {
		ping: {
			name: "ping",
			label: "Ping",
			description:
				"Reference action for adapter authors. For tests only: submits a zero-value self-transfer through signAndSend.",
			permissions: [
				{
					label: "Zero-value self-transfer placeholder",
					target: zeroAddress,
					selectors: ["0x"],
					maxValuePerTx: 0n,
					maxValuePerDay: 0n,
				},
			],
			cost: {
				gasEstimate: 21_000n,
			},
		},
	},
} as const satisfies AdapterSpec;

export const exampleNoopAdapter: AdapterImpl<typeof exampleNoopSpec> = {
	spec: exampleNoopSpec,
	calls: {
		ping: async (ctx, _input: unknown): Promise<ExampleNoopPingOutput> => {
			const { hash } = await ctx.signAndSend({
				to: ctx.signerAddress,
				data: "0x",
				value: 0n,
			});

			return { hash };
		},
	},
};

registerAdapter(exampleNoopAdapter);
