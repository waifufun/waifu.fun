import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Patron trading-policy editor data layer.
 *
 * All calls go through waifu-core (`/v2/agents/:id/trading-policy[ies]`), which
 * gates on patron ownership (Steward JWT / wf_session cookie attached by
 * `apiFetch`) and forwards to Steward with the server-side tenant key. The
 * browser never sends the tenant header and an agent token cannot reach these
 * routes — these are owner-only money guardrails.
 *
 *   GET/PUT /v2/agents/:id/trading-policy    -> caps
 *   GET/PUT /v2/agents/:id/trading-policies  -> rule array (withdraw whitelist)
 */

export type TradingPolicyCaps = {
	dailyCap?: number | null;
	perOrderCap?: number | null;
	leverageCap?: number | null;
	allowedAssets?: string[];
	allowedVenues?: string[];
};

export type PolicyRule = {
	id?: string;
	type: string;
	addresses?: string[];
	[key: string]: unknown;
};

/** The rule type Steward uses for the withdraw-address whitelist. */
export const WITHDRAW_WHITELIST_RULE_TYPE = "approved-addresses";

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = "HttpError";
	}
}

async function getJson<T>(path: string): Promise<T> {
	try {
		return await apiFetch<T>(path);
	} catch (err) {
		if (isApiError(err)) {
			const e = err as ApiError;
			throw new HttpError(e.status, e.message || `Request failed ${e.status}`);
		}
		throw err;
	}
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
	try {
		return await apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
	} catch (err) {
		if (isApiError(err)) {
			const e = err as ApiError;
			throw new HttpError(e.status, e.message || `Request failed ${e.status}`);
		}
		throw err;
	}
}

// ── caps ──────────────────────────────────────────────────────────

export function tradingPolicyKey(agentId?: string) {
	return ["trading-policy", agentId ?? null] as const;
}

export type UseTradingPolicyResult = {
	caps: TradingPolicyCaps;
	isLoading: boolean;
	error: Error | null;
	notFound: boolean;
	refetch: () => void;
};

export function useTradingPolicy(agentId?: string): UseTradingPolicyResult {
	const q = useQuery<{ policy: TradingPolicyCaps } | { notFound: true }>({
		queryKey: tradingPolicyKey(agentId),
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) return { policy: {} };
			try {
				const data = await getJson<{ ok?: boolean; policy?: TradingPolicyCaps }>(
					`/v2/agents/${encodeURIComponent(agentId)}/trading-policy`,
				);
				return { policy: data?.policy ?? {} };
			} catch (err) {
				if (err instanceof HttpError && err.status === 404) return { notFound: true };
				throw err;
			}
		},
		retry: 1,
		staleTime: 10_000,
	});

	const notFound = Boolean(q.data && "notFound" in q.data && q.data.notFound);
	const caps = q.data && "policy" in q.data ? q.data.policy : {};

	return {
		caps,
		isLoading: q.isLoading,
		error: (q.error as Error | null) ?? null,
		notFound,
		refetch: () => q.refetch(),
	};
}

export function useUpdateTradingPolicy(agentId?: string) {
	const qc = useQueryClient();
	const queryKey = tradingPolicyKey(agentId);
	return useMutation<TradingPolicyCaps, Error, TradingPolicyCaps, { previous: unknown }>({
		mutationFn: async (caps) => {
			if (!agentId) throw new Error("missing agentId");
			const res = await putJson<{ ok?: boolean; policy?: TradingPolicyCaps }>(
				`/v2/agents/${encodeURIComponent(agentId)}/trading-policy`,
				caps,
			);
			return res?.policy ?? caps;
		},
		onMutate: async (caps) => {
			await qc.cancelQueries({ queryKey });
			const previous = qc.getQueryData(queryKey);
			qc.setQueryData(queryKey, { policy: caps });
			return { previous };
		},
		onError: (_err, _caps, ctx) => {
			if (ctx) qc.setQueryData(queryKey, ctx.previous);
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey });
		},
	});
}

// ── rules (withdraw whitelist) ────────────────────────────────────

export function tradingPoliciesKey(agentId?: string) {
	return ["trading-policies", agentId ?? null] as const;
}

export type UseTradingPoliciesResult = {
	rules: PolicyRule[];
	isLoading: boolean;
	error: Error | null;
	notFound: boolean;
	refetch: () => void;
};

export function useTradingPolicies(agentId?: string): UseTradingPoliciesResult {
	const q = useQuery<{ policies: PolicyRule[] } | { notFound: true }>({
		queryKey: tradingPoliciesKey(agentId),
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) return { policies: [] };
			try {
				const data = await getJson<{ ok?: boolean; policies?: PolicyRule[] }>(
					`/v2/agents/${encodeURIComponent(agentId)}/trading-policies`,
				);
				return { policies: Array.isArray(data?.policies) ? data.policies : [] };
			} catch (err) {
				if (err instanceof HttpError && err.status === 404) return { notFound: true };
				throw err;
			}
		},
		retry: 1,
		staleTime: 10_000,
	});

	const notFound = Boolean(q.data && "notFound" in q.data && q.data.notFound);
	const rules = q.data && "policies" in q.data ? q.data.policies : [];

	return {
		rules,
		isLoading: q.isLoading,
		error: (q.error as Error | null) ?? null,
		notFound,
		refetch: () => q.refetch(),
	};
}

export function useUpdateTradingPolicies(agentId?: string) {
	const qc = useQueryClient();
	const queryKey = tradingPoliciesKey(agentId);
	return useMutation<PolicyRule[], Error, PolicyRule[], { previous: unknown }>({
		mutationFn: async (rules) => {
			if (!agentId) throw new Error("missing agentId");
			const res = await putJson<{ ok?: boolean; policies?: PolicyRule[] }>(
				`/v2/agents/${encodeURIComponent(agentId)}/trading-policies`,
				{ policies: rules },
			);
			return Array.isArray(res?.policies) ? res.policies : rules;
		},
		onMutate: async (rules) => {
			await qc.cancelQueries({ queryKey });
			const previous = qc.getQueryData(queryKey);
			qc.setQueryData(queryKey, { policies: rules });
			return { previous };
		},
		onError: (_err, _rules, ctx) => {
			if (ctx) qc.setQueryData(queryKey, ctx.previous);
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey });
		},
	});
}

// ── helpers ───────────────────────────────────────────────────────

/** Pull the withdraw whitelist (approved-addresses) out of the rule array. */
export function findWithdrawWhitelist(rules: PolicyRule[]): PolicyRule | undefined {
	return rules.find((r) => r.type === WITHDRAW_WHITELIST_RULE_TYPE);
}

/** Upsert the withdraw whitelist rule into a rules array, returning a new array. */
export function setWithdrawWhitelist(rules: PolicyRule[], addresses: string[]): PolicyRule[] {
	const idx = rules.findIndex((r) => r.type === WITHDRAW_WHITELIST_RULE_TYPE);
	const rule: PolicyRule = { ...(idx >= 0 ? rules[idx] : {}), type: WITHDRAW_WHITELIST_RULE_TYPE, addresses };
	if (idx >= 0) {
		const next = [...rules];
		next[idx] = rule;
		return next;
	}
	return [...rules, rule];
}

/** Loose EVM address check for client-side validation before save. */
export function isLikelyEvmAddress(value: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
