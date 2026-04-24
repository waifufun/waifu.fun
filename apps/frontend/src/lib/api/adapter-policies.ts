import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Adapter policy contract as shipped by W2.7.
 *
 * `GET /v2/agents/:id/adapter-policies` -> { policies: AdapterPolicy[] }
 * `PUT /v2/agents/:id/adapter-policies` -> upserts one or many policies
 * `GET /v2/adapters/templates` -> { templates: Record<slug, AdapterTemplate> }
 */
export type AdapterSlug = "pancake" | "venus" | "aster" | "hyperliquid" | "polymarket" | string;

export type AdapterPolicy = {
	adapter: AdapterSlug;
	enabled: boolean;
	perTxCapBnb: number | null;
	dailyCapBnb: number | null;
	updatedAt?: string;
};

export type AdapterTemplate = {
	slug: AdapterSlug;
	name: string;
	description?: string;
	defaultPerTxCapBnb: number;
	defaultDailyCapBnb: number;
	icon?: string | null;
	color?: string | null;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = "HttpError";
	}
}

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "include",
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed ${res.status}: ${path}`);
	}
	return (await res.json()) as T;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "PUT",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed ${res.status}: ${path}`);
	}
	return (await res.json()) as T;
}

/**
 * Fallback templates used when the backend is unreachable. Keeps the editor
 * usable during local dev and staging when W2.7 is still in flight.
 */
export const FALLBACK_TEMPLATES: Record<string, AdapterTemplate> = {
	pancake: {
		slug: "pancake",
		name: "PancakeSwap",
		description: "DEX swaps on BSC",
		defaultPerTxCapBnb: 0.1,
		defaultDailyCapBnb: 1,
		color: "#d58d36",
	},
	venus: {
		slug: "venus",
		name: "Venus",
		description: "Lending and borrowing on BSC",
		defaultPerTxCapBnb: 0.1,
		defaultDailyCapBnb: 1,
		color: "#1cc995",
	},
	aster: {
		slug: "aster",
		name: "Aster",
		description: "Perps on BSC",
		defaultPerTxCapBnb: 0.05,
		defaultDailyCapBnb: 0.5,
		color: "#7c7ce0",
	},
	hyperliquid: {
		slug: "hyperliquid",
		name: "Hyperliquid",
		description: "Perps on Hyperliquid L1",
		defaultPerTxCapBnb: 0.05,
		defaultDailyCapBnb: 0.5,
		color: "#5ad1c1",
	},
	polymarket: {
		slug: "polymarket",
		name: "Polymarket",
		description: "Prediction markets",
		defaultPerTxCapBnb: 0.02,
		defaultDailyCapBnb: 0.2,
		color: "#2a75d3",
	},
};

/**
 * Static-ish templates. Cached for the full app lifetime since the backend
 * treats them as immutable config. Falls back to FALLBACK_TEMPLATES on 404.
 */
export function useAdapterTemplates() {
	return useQuery<Record<string, AdapterTemplate>>({
		queryKey: ["adapter-templates"],
		queryFn: async () => {
			try {
				const data = await getJson<{ templates?: Record<string, AdapterTemplate> }>("/v2/adapters/templates");
				if (data?.templates && typeof data.templates === "object") {
					return { ...FALLBACK_TEMPLATES, ...data.templates };
				}
				return FALLBACK_TEMPLATES;
			} catch (err) {
				if (err instanceof HttpError && err.status === 404) {
					return FALLBACK_TEMPLATES;
				}
				throw err;
			}
		},
		staleTime: 60 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		retry: 1,
	});
}

export type UseAdapterPoliciesResult = {
	policies: AdapterPolicy[];
	templates: Record<string, AdapterTemplate>;
	isLoading: boolean;
	error: Error | null;
	notFound: boolean;
	refetch: () => void;
};

/**
 * Reads adapter policies for an agent. Returns notFound=true when the backend
 * route isn't live yet so the UI can render a "coming soon" empty state
 * instead of a hard error.
 */
export function useAdapterPolicies(agentId?: string): UseAdapterPoliciesResult {
	const templatesQ = useAdapterTemplates();

	const policiesQ = useQuery<{ policies: AdapterPolicy[] } | { notFound: true }>({
		queryKey: ["adapter-policies", agentId ?? null],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) return { policies: [] };
			try {
				const data = await getJson<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/adapter-policies`);
				if (data && typeof data === "object" && Array.isArray((data as { policies?: unknown }).policies)) {
					return { policies: (data as { policies: AdapterPolicy[] }).policies };
				}
				if (Array.isArray(data)) return { policies: data as AdapterPolicy[] };
				return { policies: [] };
			} catch (err) {
				if (err instanceof HttpError && err.status === 404) {
					return { notFound: true };
				}
				throw err;
			}
		},
		retry: 1,
		staleTime: 10_000,
	});

	const notFound = Boolean(policiesQ.data && "notFound" in policiesQ.data && policiesQ.data.notFound);
	const policies = policiesQ.data && "policies" in policiesQ.data ? policiesQ.data.policies : [];

	return {
		policies,
		templates: templatesQ.data ?? FALLBACK_TEMPLATES,
		isLoading: policiesQ.isLoading || templatesQ.isLoading,
		error: (policiesQ.error as Error | null) ?? (templatesQ.error as Error | null) ?? null,
		notFound,
		refetch: () => {
			policiesQ.refetch();
		},
	};
}

export type PolicyUpdate = {
	adapter: AdapterSlug;
	enabled?: boolean;
	perTxCapBnb?: number | null;
	dailyCapBnb?: number | null;
};

type PoliciesCache = { policies: AdapterPolicy[] } | { notFound: true } | undefined;

function applyOptimistic(cache: PoliciesCache, update: PolicyUpdate): PoliciesCache {
	if (!cache || "notFound" in cache) return cache;
	const next = [...cache.policies];
	const idx = next.findIndex((p) => p.adapter === update.adapter);
	const existing = idx >= 0 ? next[idx] : undefined;
	const base: AdapterPolicy = existing ?? {
		adapter: update.adapter,
		enabled: false,
		perTxCapBnb: null,
		dailyCapBnb: null,
	};
	const merged: AdapterPolicy = {
		...base,
		enabled: update.enabled ?? base.enabled,
		perTxCapBnb: update.perTxCapBnb !== undefined ? update.perTxCapBnb : base.perTxCapBnb,
		dailyCapBnb: update.dailyCapBnb !== undefined ? update.dailyCapBnb : base.dailyCapBnb,
	};
	if (idx >= 0) next[idx] = merged;
	else next.push(merged);
	return { policies: next };
}

/**
 * Upserts a single adapter policy. Applies an optimistic cache update on
 * mutate, rolls back on error, and refetches on settle to reconcile with
 * whatever the backend decided to persist.
 */
export function useUpdateAdapterPolicy(agentId?: string) {
	const qc = useQueryClient();
	const queryKey = ["adapter-policies", agentId ?? null] as const;
	return useMutation<AdapterPolicy, Error, PolicyUpdate, { previous: PoliciesCache }>({
		mutationFn: async (update) => {
			if (!agentId) throw new Error("missing agentId");
			const res = await putJson<{ policy?: AdapterPolicy } | AdapterPolicy>(
				`/v2/agents/${encodeURIComponent(agentId)}/adapter-policies`,
				{ policies: [update] },
			);
			if (res && typeof res === "object" && "policy" in res && res.policy) {
				return res.policy as AdapterPolicy;
			}
			if (res && typeof res === "object" && "adapter" in (res as AdapterPolicy)) {
				return res as AdapterPolicy;
			}
			// Server 200'd with an unexpected shape; synthesize from the update.
			return {
				adapter: update.adapter,
				enabled: update.enabled ?? false,
				perTxCapBnb: update.perTxCapBnb ?? null,
				dailyCapBnb: update.dailyCapBnb ?? null,
			};
		},
		onMutate: async (update) => {
			if (!agentId) return { previous: undefined };
			await qc.cancelQueries({ queryKey });
			const previous = qc.getQueryData<PoliciesCache>(queryKey);
			qc.setQueryData<PoliciesCache>(queryKey, applyOptimistic(previous, update));
			return { previous };
		},
		onError: (_err, _update, ctx) => {
			if (!agentId || !ctx) return;
			qc.setQueryData<PoliciesCache>(queryKey, ctx.previous);
		},
		onSettled: () => {
			if (agentId) qc.invalidateQueries({ queryKey });
		},
	});
}
