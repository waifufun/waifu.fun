# @waifufun/agent-actions

`@waifufun/agent-actions` defines the shared adapter contract for Waifu agents that execute on-chain actions. Adapters describe what they can do, which permissions they need, and how the runtime should call them. Production adapters now exist for **PancakeSwap v3** and **Venus** (BSC); `example-noop` remains a reference stub.

The package also defines the **capability descriptor** contract (`src/capability/`) — the schema-driven, JSON-safe shape the Patron UI renders against to auto-build cards + action forms per capability. See [Capabilities](#capabilities) below.

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

## Capabilities

A **capability** is a self-describing agent power (Hyperliquid perps, Venus lending, a future tax-funded arb vault). Where an adapter is the *execution + Zodiac-permission* layer, a capability descriptor is the *discovery + UI* layer. The two relate as:

- Adapter-backed capabilities (PancakeSwap v3, Venus) are **synthesized from the spec** via `capabilityFromAdapterSpec(spec)`. No hand-authoring.
- Bespoke capabilities (Hyperliquid today) are **hand-authored descriptors** (`hyperliquidPerpsDescriptor(ctx)`) that wrap existing routes as their data/execution backend — nothing is ripped out.
- Future capabilities (Polymarket, tax-arb-vault) ship as **planned stub descriptors** first: status `locked`, no execution endpoints. A new venue = add a descriptor (+ later an adapter), nothing else.

Descriptors are pure values: JSON-serializable, no functions, no bigint (gas estimates are stringified). The contract lives in `src/capability/types.ts`:

- `CapabilityDescriptor` — slug, name, category, maturity, per-agent `status`, chains, wallets, requirements, data providers, and action descriptors.
- `CapabilityActionDescriptor` — slug, `mode` (`read` | `prepare_tx` | `client_signed` | `agent_signed` | `server_job`), `requiresConsent`, a schema-driven `inputs` form, and an `endpoint` (null for planned).
- `AgentCapabilitiesResponse` — the envelope returned by `GET /v2/agents/:id/capabilities`.

Execution (a generic `POST .../capabilities/:cap/actions/:action` route) and Zodiac-module attachment to live Safes are **intentionally deferred**. This package + the read endpoint are the scaffold those plug into.

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
