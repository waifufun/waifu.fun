/**
 * Synthesize a capability descriptor from an agent-actions {@link AdapterSpec}.
 *
 * This is the proof that the descriptor contract generalizes over the EXISTING
 * adapter layer: PancakeSwap v3 and Venus become render-able capabilities with
 * zero hand-authoring. The adapter spec already carries name, chains, tier, and
 * per-action permissions/cost — we project that onto the UI descriptor shape.
 *
 * Note: adapter actions don't declare input field schemas (their inputs are
 * TS phantom types, erased at runtime). So adapter-backed action descriptors
 * ship with an empty `inputs` array for now; richer forms can be layered on by
 * giving adapters an optional `uiInputs` field later. The endpoint is null
 * because generic capability execution is intentionally deferred (scaffold).
 */

import type { AdapterSpec } from "../types.js";
import type {
	CapabilityActionDescriptor,
	CapabilityActionMode,
	CapabilityCategory,
	CapabilityDescriptor,
	CapabilityStatus,
} from "./types.js";

/** Map an adapter slug to a UI category. Conservative defaults. */
function categoryForAdapter(slug: string): CapabilityCategory {
	if (slug.includes("venus")) return "lending";
	if (slug.includes("pancakeswap") || slug.includes("swap")) return "swap";
	return "onchain";
}

/**
 * Infer the action execution mode from the adapter action. Reads (zero gas,
 * "quote"/"liquidity"-style) are `read`; everything else is an on-chain write
 * the agent's signer performs once execution is wired (`agent_signed`).
 */
function modeForAction(actionName: string, gasEstimate: bigint): CapabilityActionMode {
	const readish = /quote|liquidity|view|read|status/i.test(actionName);
	if (readish || gasEstimate === 0n) return "read";
	return "agent_signed";
}

export interface FromAdapterOptions {
	/** Per-agent availability. Defaults to "available" (adapter exists, not yet enabled for this agent). */
	status?: CapabilityStatus;
	/** Override the summary line. */
	summary?: string;
	/** Extra tags appended to the synthesized set. */
	tags?: string[];
}

/** Build the action descriptors for an adapter spec. */
function actionsFromSpec(spec: AdapterSpec): CapabilityActionDescriptor[] {
	return Object.values(spec.actions).map((action) => {
		const mode = modeForAction(action.name, action.cost.gasEstimate);
		const descriptor: CapabilityActionDescriptor = {
			slug: action.name,
			label: action.label,
			description: action.description,
			mode,
			// reads never need consent; writes do until execution + policy is wired.
			requiresConsent: mode !== "read",
			// adapter inputs are TS phantom types (erased) — no schema-driven form yet.
			inputs: [],
			// execution is deferred in this scaffold: no generic action route yet.
			endpoint: null,
			cost: {
				...(action.cost.feeBps !== undefined ? { feeBps: action.cost.feeBps } : {}),
				gasEstimate: action.cost.gasEstimate.toString(),
			},
		};
		return descriptor;
	});
}

/**
 * Project an {@link AdapterSpec} onto a {@link CapabilityDescriptor}.
 *
 * The result is a pure, JSON-safe value (bigints stringified). It carries no
 * per-agent wallet/requirement resolution — callers layer that on with the
 * agent context (see the API registry builder). Here we emit the venue-level
 * shape plus the agent `status` the caller passes in.
 */
export function capabilityFromAdapterSpec(spec: AdapterSpec, opts: FromAdapterOptions = {}): CapabilityDescriptor {
	const category = categoryForAdapter(spec.slug);
	return {
		slug: spec.slug,
		name: spec.name,
		summary: opts.summary ?? `${spec.name} adapter (${Object.keys(spec.actions).length} actions).`,
		category,
		// adapter `tier: "default"` maps to a live capability; "opt-in" stays experimental.
		maturity: spec.tier === "default" ? "live" : "experimental",
		status: opts.status ?? "available",
		tags: [`adapter:${spec.slug}`, `tier:${spec.tier}`, ...(opts.tags ?? [])],
		chains: [...spec.chains],
		// wallet/requirement resolution is per-agent; the synthesizer emits an
		// agent-safe execution wallet requirement that the API fills in.
		wallets: [
			{
				role: "agent-safe",
				chain: "bsc",
				address: null,
				required: true,
			},
		],
		requirements: [
			{
				kind: "wallet",
				id: `${spec.slug}:agent-safe`,
				label: "Agent Safe with Zodiac Roles module",
				required: true,
				// live launches have BARE safes (no module) today — never satisfied yet.
				satisfied: false,
				hint: "Zodiac Roles module must be attached to the AgentSafe before autonomous execution.",
			},
		],
		// adapter data reads aren't exposed as endpoints in this scaffold.
		data: [],
		actions: actionsFromSpec(spec),
		adapterSlug: spec.slug,
	};
}
