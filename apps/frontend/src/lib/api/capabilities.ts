/**
 * Capability registry client (Patron UI).
 *
 * Fetches `GET /v2/agents/:id/capabilities` (#998) and exposes the descriptors
 * the generic `<CapabilityPanel>` renders against. This is the READ-PATH only —
 * the descriptors carry schema-driven UI metadata (data providers + action
 * forms), no execution.
 *
 * The descriptor TYPES here are a frontend-local mirror of the contract in
 * `@waifufun/agent-actions/capability` (`packages/agent-actions/src/capability/
 * types.ts`). We deliberately do NOT import that package into the frontend: it
 * pulls in viem + the adapter layer, which has no place in a static-export
 * client bundle. The shapes are pure JSON, so a structural mirror is safe; the
 * API serializes the exact same objects this file types. If the backend
 * contract changes, update both (the api `capabilities.test.ts` guards the
 * server side).
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./_fetcher";

export type CapabilityCategory = "trading" | "lending" | "swap" | "treasury" | "vault" | "social" | "onchain";

export type CapabilityMaturity = "live" | "experimental" | "planned" | "deprecated";

/** Per-agent availability: enabled (wired), available (could enable), locked (gated/planned). */
export type CapabilityStatus = "enabled" | "available" | "locked";

export interface CapabilityRequirement {
	kind: "wallet" | "venue-key" | "chain" | "policy" | "consent";
	id: string;
	label: string;
	required: boolean;
	satisfied: boolean;
	hint?: string;
}

export interface CapabilityWalletDescriptor {
	role: "agent-safe" | "agent-hot" | "patron" | "venue-bridge";
	chain: string;
	venue?: string;
	address: string | null;
	required: boolean;
}

/** Render hint vocabulary the generic panel maps to widgets. */
export type CapabilityDataRender =
	| "metric-grid"
	| "positions-table"
	| "line-chart"
	| "income-card"
	| "activity-feed"
	| "json";

export interface CapabilityDataProvider {
	view: string;
	label: string;
	render: CapabilityDataRender;
	endpoint: string;
}

export type CapabilityActionFieldType =
	| "chain-select"
	| "token-select"
	| "address"
	| "amount"
	| "number"
	| "text"
	| "select"
	| "boolean";

export interface CapabilityActionField {
	name: string;
	label: string;
	type: CapabilityActionFieldType;
	required: boolean;
	options?: Array<{ value: string; label: string }>;
	placeholder?: string;
	help?: string;
}

export type CapabilityActionMode = "read" | "prepare_tx" | "client_signed" | "agent_signed" | "server_job";

export interface CapabilityActionDescriptor {
	slug: string;
	label: string;
	description: string;
	mode: CapabilityActionMode;
	requiresConsent: boolean;
	inputs: CapabilityActionField[];
	endpoint: string | null;
	method?: "POST" | "PUT" | "PATCH";
	cost?: {
		feeBps?: number;
		gasEstimate?: string;
	};
}

export interface CapabilityDescriptor {
	slug: string;
	name: string;
	summary: string;
	category: CapabilityCategory;
	maturity: CapabilityMaturity;
	status: CapabilityStatus;
	tags: string[];
	chains: number[];
	wallets: CapabilityWalletDescriptor[];
	requirements: CapabilityRequirement[];
	data: CapabilityDataProvider[];
	actions: CapabilityActionDescriptor[];
	adapterSlug: string | null;
}

export interface AgentCapabilitiesResponse {
	agent: {
		id: string;
		tokenAddress: string | null;
	};
	capabilities: CapabilityDescriptor[];
	ts: number;
}

function normalizeCapabilities(raw: unknown): AgentCapabilitiesResponse {
	const empty: AgentCapabilitiesResponse = {
		agent: { id: "", tokenAddress: null },
		capabilities: [],
		ts: 0,
	};
	if (!raw || typeof raw !== "object") return empty;
	const r = raw as Record<string, unknown>;
	const caps = Array.isArray(r.capabilities) ? (r.capabilities as CapabilityDescriptor[]) : [];
	const agent = r.agent && typeof r.agent === "object" ? (r.agent as AgentCapabilitiesResponse["agent"]) : empty.agent;
	return {
		agent: { id: agent.id ?? "", tokenAddress: agent.tokenAddress ?? null },
		capabilities: caps,
		ts: typeof r.ts === "number" ? r.ts : Date.now(),
	};
}

/**
 * Load an agent's registered capabilities.
 *
 * Slow-changing data (a capability set only changes when a venue is added or a
 * wallet is registered), so we refetch on a relaxed cadence and let the
 * per-widget pollers inside the panel handle live data.
 */
export function useAgentCapabilities(agentId?: string) {
	return useQuery<AgentCapabilitiesResponse>({
		queryKey: ["agent-capabilities", agentId ?? null],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			const raw = await apiFetch<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/capabilities`);
			return normalizeCapabilities(raw);
		},
		refetchInterval: 120_000,
		retry: 1,
	});
}
