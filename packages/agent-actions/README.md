# @waifufun/agent-actions

`@waifufun/agent-actions` defines the shared adapter contract for Waifu agents that execute on-chain actions. Adapters describe what they can do, which permissions they need, and how the runtime should call them. The package intentionally contains no production protocol adapters yet; `example-noop` is only a reference stub for tests and implementers.

## What an adapter provides

Every adapter exports an `AdapterImpl`:

- `spec`: stable metadata used by the DB, policy editor, action log, and role-template generator.
- `calls`: runtime functions keyed exactly like `spec.actions`.
- `permissions`: per-action Zodiac Roles inputs (`target`, function selectors, and optional value caps).
- `cost`: rough fee/gas hints for UI and planning.

## Implement a new adapter

1. Create `src/adapters/<slug>.ts`.
2. Define input/output interfaces for each action.
3. Define an `AdapterSpec` with:
   - stable `slug` such as `pancakeswap-v3`
   - supported `chains`
   - risk `tier` (`default` only for conservative actions; otherwise `opt-in`)
   - `contracts` touched by the adapter
   - `actions` and their required `AdapterPermission[]`
4. Implement `calls` using `AdapterCallContext.signAndSend` for writes.
5. Register the adapter with `registerAdapter(adapter)`.
6. Export it from `src/adapters/index.ts`.
7. Add tests for registry behavior, role-template output, and call-shape edge cases.

## Example

```ts
import type { AdapterImpl, AdapterSpec } from "@waifufun/agent-actions";
import { registerAdapter } from "@waifufun/agent-actions";

interface SwapInput {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
}

interface SwapOutput {
  hash: `0x${string}`;
}

const router = "0x0000000000000000000000000000000000000001" as const;

export const swapSpec = {
  slug: "example-swap",
  name: "Example Swap",
  chains: [56],
  tier: "opt-in",
  contracts: { router },
  actions: {
    swapExactIn: {
      name: "swapExactIn",
      label: "Swap exact input",
      description: "Swaps an exact input amount with caller-provided slippage limits.",
      permissions: [
        {
          label: "Call swap router",
          target: router,
          selectors: ["0x414bf389"],
          maxValuePerTx: 0n,
        },
      ],
      cost: { feeBps: 25, gasEstimate: 250_000n },
    },
  },
} as const satisfies AdapterSpec;

export const swapAdapter: AdapterImpl<typeof swapSpec> = {
  spec: swapSpec,
  calls: {
    swapExactIn: async (ctx, input: unknown): Promise<SwapOutput> => {
      const swap = input as SwapInput;
      // Encode calldata in the real adapter, then submit through Steward.
      const { hash } = await ctx.signAndSend({
        to: router,
        data: "0x",
        value: 0n,
      });
      void swap;
      return { hash };
    },
  },
};

registerAdapter(swapAdapter);
```

## Integration points

- **Policy editor UI** reads `AdapterSpec.actions[*].permissions` and `cost` to show what enabling an action allows.
- **Zodiac Roles encoder** consumes `buildRoleTemplate(...)` output and converts adapter-prefixed permissions into concrete Safe role rules.
- **Action log** stores adapter/action slugs from `AdapterSpec` so user intent, submitted txs, and results share a stable vocabulary.
- **Agent runtime** looks up implementations with `getAdapter(slug)` and invokes `calls[actionName](ctx, input)` after pause/kill checks and policy validation.

## Testing guidelines

- Use deterministic fixture adapters; do not call live RPCs in unit tests.
- Assert registry round-trips with `registerAdapter` and `getAdapter`.
- Assert `listDefaultAdapters` only returns `tier: "default"` specs.
- Assert `buildRoleTemplate` preserves permission targets/selectors/caps and prefixes labels with the adapter slug.
- Assert adapter-specific errors extend `AdapterError` and keep distinct class names.
- For runtime calls, mock `signAndSend` and verify the generated `{ to, data, value }` shape.

## Current adapters

- `example-noop`: opt-in BSC stub that submits a zero-value self-transfer through `signAndSend`. It exists only as a reference implementation and test fixture, not as a production adapter.
