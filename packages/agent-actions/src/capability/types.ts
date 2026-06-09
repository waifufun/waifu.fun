/**
 * Capability descriptor types — the render-against contract.
 *
 * A *capability* is a self-describing agent power (trading on Hyperliquid,
 * lending on Venus, swapping on PancakeSwap, a future tax-funded arb vault).
 * Each capability exposes a descriptor: enough schema-driven metadata for a
 * generic React panel to render a card + action forms WITHOUT a hand-built
 * component per venue.
 *
 * Capabilities are the *UI/discovery surface*. The on-chain execution + Zodiac
 * Roles permission layer lives in {@link AdapterImpl}/{@link AdapterSpec}. Where a
 * capability is backed by an adapter, its action descriptors are SYNTHESIZED
 * from that adapter's spec (see `from-adapter.ts`). Where a capability wraps a
 * bespoke surface (Hyperliquid today), the descriptor is authored by hand and
 * the existing routes remain the execution backend.
 *
 * Nothing in this file performs execution. These are pure, serializable
 * descriptors: they round-trip through JSON unchanged (no bigint, no functions).
 */

/** Broad grouping for ordering + iconography in the UI. */
export type CapabilityCategory = "trading" | "lending" | "swap" | "treasury" | "vault" | "social" | "onchain";

/**
 * Lifecycle maturity of the capability itself, independent of any one agent.
 * `live` = production, `experimental` = shipped behind care, `planned` = stub
 * descriptor with no execution backend yet.
 */
export type CapabilityMaturity = "live" | "experimental" | "planned" | "deprecated";

/**
 * Per-agent availability of a capability. This is the field a Patron UI uses
 * to decide whether to render the action forms as active, locked, or a setup
 * prompt.
 *
 * - `enabled`    — wired + ready for this agent (e.g. HL wallet present).
 * - `available`  — capability could be turned on, requirements not yet met.
 * - `locked`     — gated (planned capability, or policy/consent blocks it).
 */
export type CapabilityStatus = "enabled" | "available" | "locked";

/**
 * A requirement the capability needs satisfied for this agent. Surfaced so the
 * UI can show "needs a Hyperliquid wallet" / "needs a Steward venue key" rather
 * than failing silently.
 */
export interface CapabilityRequirement {
	kind: "wallet" | "venue-key" | "chain" | "policy" | "consent";
	/** Stable id, e.g. "hyperliquid-wallet", "steward:hyperliquid", "chain:56". */
	id: string;
	label: string;
	/** Whether the capability is unusable without it. */
	required: boolean;
	/** Whether this agent currently satisfies it. */
	satisfied: boolean;
	/** Optional human hint on how to satisfy it. */
	hint?: string;
}

/** A wallet the capability binds to (role + chain + venue), for UI display. */
export interface CapabilityWalletDescriptor {
	role: "agent-safe" | "agent-hot" | "patron" | "venue-bridge";
	chain: string;
	venue?: string;
	/** Resolved address if known for this agent, else null. */
	address: string | null;
	required: boolean;
}

/**
 * Summary of a read data-provider the capability exposes (positions, pnl,
 * income, activity). The UI uses `endpoint` to fetch and `view` to pick a
 * render component from its small vocabulary.
 */
export interface CapabilityDataProvider {
	/** Stable view key: "summary" | "positions" | "pnl" | "income" | "activity" | custom. */
	view: string;
	label: string;
	/** Render hint for the generic panel. */
	render: "metric-grid" | "positions-table" | "line-chart" | "income-card" | "activity-feed" | "json";
	/** Fully-qualified read endpoint (relative to API origin). */
	endpoint: string;
}

/**
 * One field in an action form. Schema-driven so the generic renderer can build
 * the input without bespoke code. `type` maps to a component in the UI's field
 * vocabulary.
 */
export interface CapabilityActionField {
	name: string;
	label: string;
	type: "chain-select" | "token-select" | "address" | "amount" | "number" | "text" | "select" | "boolean";
	required: boolean;
	/** For `select`: allowed options. */
	options?: Array<{ value: string; label: string }>;
	placeholder?: string;
	help?: string;
}

/**
 * How an action resolves. Mirrors the eventual execution contract so the UI can
 * render the right affordance (a sign button vs a confirm dialog vs read-only).
 *
 * - `read`          — pure data fetch, no state change.
 * - `prepare_tx`    — server returns an unsigned tx plan to display.
 * - `client_signed` — patron signs in their wallet (e.g. HL deposit today).
 * - `agent_signed`  — agent's Steward/Safe signer executes (gated by policy).
 * - `server_job`    — enqueues a worker job (policy update, harvest).
 */
export type CapabilityActionMode = "read" | "prepare_tx" | "client_signed" | "agent_signed" | "server_job";

/** A single invokable action on a capability, fully described for rendering. */
export interface CapabilityActionDescriptor {
	/** Stable slug, unique within the capability: "deposit", "place-order", "set-policy". */
	slug: string;
	label: string;
	description: string;
	mode: CapabilityActionMode;
	/** Whether a human must explicitly consent before this runs (sign / confirm). */
	requiresConsent: boolean;
	/** Schema-driven input form. Empty array = no inputs (e.g. a one-click action). */
	inputs: CapabilityActionField[];
	/**
	 * Execution endpoint the UI calls. For wrapped bespoke surfaces this points at
	 * the existing route (compat); for adapter-backed actions it points at the
	 * future generic capability action route. Null for `planned` capabilities.
	 */
	endpoint: string | null;
	/**
	 * HTTP method for `endpoint`. Defaults to POST. Wrapped bespoke routes may use
	 * a different verb (e.g. the live trading-policy route is a PUT), so the
	 * descriptor states it explicitly — a generic client must not assume POST.
	 */
	method?: "POST" | "PUT" | "PATCH";
	/** Rough cost hint for UI/planning. Plain numbers only (JSON-safe). */
	cost?: {
		feeBps?: number;
		/** Gas estimate as a decimal string (descriptors stay bigint-free). */
		gasEstimate?: string;
	};
}

/**
 * The full per-agent capability descriptor. This is the object returned by
 * `GET /v2/agents/:id/capabilities` and rendered by the Patron UI. It is a pure
 * value: JSON-serializable, no functions, no bigint.
 */
export interface CapabilityDescriptor {
	slug: string;
	name: string;
	summary: string;
	category: CapabilityCategory;
	/** Capability-level maturity (venue-wide). */
	maturity: CapabilityMaturity;
	/** Per-agent availability. */
	status: CapabilityStatus;
	/** Free-form tags, e.g. ["venue:hyperliquid", "perps"]. */
	tags: string[];
	/** Chains this capability touches, by chainId. */
	chains: number[];
	/** Wallets the capability binds to for this agent. */
	wallets: CapabilityWalletDescriptor[];
	/** Requirements + whether each is satisfied for this agent. */
	requirements: CapabilityRequirement[];
	/** Read data providers (cards/tables/charts). */
	data: CapabilityDataProvider[];
	/** Invokable actions. */
	actions: CapabilityActionDescriptor[];
	/** If backed by an agent-actions adapter, its slug. Null for bespoke/planned. */
	adapterSlug: string | null;
}

/** The response envelope for the capability registry read endpoint. */
export interface AgentCapabilitiesResponse {
	/** Canonical agent identity the descriptors were resolved for. */
	agent: {
		/** Internal stable persona id (agent_personas.agent_id). */
		id: string;
		/** Token address if the agent has launched, else null. */
		tokenAddress: string | null;
	};
	capabilities: CapabilityDescriptor[];
	ts: number;
}
