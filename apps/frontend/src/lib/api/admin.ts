"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, isApiError } from "./_fetcher";

/**
 * W5.7: Admin (kill-switch) API client.
 *
 * Surfaces the W1.8 admin routes:
 *   POST /v2/admin/agents/:id/pause-brain
 *   POST /v2/admin/agents/:id/resume-brain
 *   POST /v2/admin/agents/:id/freeze-withdrawals
 *   POST /v2/admin/agents/:id/unfreeze-withdrawals
 *   POST /v2/admin/agents/:id/kill
 *   GET  /v2/admin/agents/:id/status
 *
 * All requests carry the operator's admin token via Authorization: Bearer.
 * The token is kept for the current browser session only; callers use the
 * helpers below so the public API does not depend on the storage backend.
 */

export const ADMIN_TOKEN_KEY = "waifu-admin-token";

let inMemoryAdminToken: string | null = null;

function browserSessionStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function clearLegacyAdminToken(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(ADMIN_TOKEN_KEY);
	} catch {
		/* localStorage may be blocked; ignored */
	}
}

function readLegacyAdminToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(ADMIN_TOKEN_KEY);
	} catch {
		return null;
	}
}

export type AdminAgent = {
	id: string;
	name: string;
	ticker: string;
	avatar?: string | null;
	status?: string | null;
	xHandle?: string | null;
	owner?: string | null;
	brainPausedAt?: string | null;
	withdrawalsPausedAt?: string | null;
	killedAt?: string | null;
};

export type AdminAgentStatus = {
	id?: string;
	brainPausedAt: string | null;
	withdrawalsPausedAt: string | null;
	killedAt: string | null;
};

export type AdminAuditEntry = {
	id: string | number;
	timestamp: string;
	agentId: string | null;
	action: string;
	actor: string | null;
	reason: string | null;
};

export type AdminCombinedStatus = "killed" | "frozen-withdrawals" | "paused-brain" | "dormant" | "live";

export function getAdminToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const storage = browserSessionStorage();
		const legacy = readLegacyAdminToken();
		const stored = storage?.getItem(ADMIN_TOKEN_KEY) ?? legacy ?? inMemoryAdminToken;
		if (legacy && storage && !storage.getItem(ADMIN_TOKEN_KEY)) {
			storage.setItem(ADMIN_TOKEN_KEY, legacy);
		}
		if (stored) inMemoryAdminToken = stored;
		clearLegacyAdminToken();
		return stored;
	} catch {
		return inMemoryAdminToken;
	}
}

export function setAdminToken(token: string): void {
	if (typeof window === "undefined") return;
	inMemoryAdminToken = token;
	try {
		browserSessionStorage()?.setItem(ADMIN_TOKEN_KEY, token);
		clearLegacyAdminToken();
	} catch {
		/* sessionStorage may be blocked; memory fallback remains */
	}
}

export function clearAdminToken(): void {
	if (typeof window === "undefined") return;
	inMemoryAdminToken = null;
	try {
		browserSessionStorage()?.removeItem(ADMIN_TOKEN_KEY);
		clearLegacyAdminToken();
	} catch {
		/* ignored */
	}
}

function adminHeaders(token: string | null): Record<string, string> {
	// Admin operator token always wins over the Steward JWT module-global.
	// apiFetch preserves an explicit Authorization header set in init.headers.
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function adminGet<T>(path: string, token: string | null): Promise<T> {
	try {
		return await apiFetch<T>(path, { headers: adminHeaders(token) });
	} catch (err) {
		if (typeof err === "object" && err !== null && "status" in err) {
			const e = err as { status: number; message: string };
			throw new Error(`GET ${path} failed: ${e.status}${e.message ? ` ${e.message}` : ""}`);
		}
		throw err;
	}
}

async function adminPost<T>(path: string, token: string | null): Promise<T> {
	try {
		return await apiFetch<T>(path, { method: "POST", headers: adminHeaders(token) });
	} catch (err) {
		if (typeof err === "object" && err !== null && "status" in err) {
			const e = err as { status: number; message: string };
			throw new Error(`POST ${path} failed: ${e.status}${e.message ? ` ${e.message}` : ""}`);
		}
		throw err;
	}
}

async function adminPostJson<T>(path: string, token: string | null, body: Record<string, unknown>): Promise<T> {
	try {
		return await apiFetch<T>(path, { method: "POST", headers: adminHeaders(token), body: JSON.stringify(body) });
	} catch (err) {
		if (typeof err === "object" && err !== null && "status" in err) {
			const e = err as { status: number; message: string };
			throw new Error(`POST ${path} failed: ${e.status}${e.message ? ` ${e.message}` : ""}`);
		}
		throw err;
	}
}

/* ─── shape coercion ─── */

function coerceAgent(raw: unknown): AdminAgent | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const id = (r.id ?? r._id ?? r.address ?? r.contractAddress) as string | undefined;
	if (!id) return null;
	return {
		id,
		name: (r.name as string) ?? "unnamed",
		ticker: (r.ticker as string) ?? (r.symbol as string) ?? "",
		avatar: (r.avatar as string | null | undefined) ?? (r.image as string | null | undefined) ?? null,
		status: (r.status as string | null | undefined) ?? null,
		xHandle: (r.xHandle as string | null | undefined) ?? null,
		owner: (r.owner as string | null | undefined) ?? null,
		brainPausedAt: (r.brainPausedAt as string | null | undefined) ?? null,
		withdrawalsPausedAt: (r.withdrawalsPausedAt as string | null | undefined) ?? null,
		killedAt: (r.killedAt as string | null | undefined) ?? null,
	};
}

export function combinedStatus(agent: AdminAgent): AdminCombinedStatus {
	if (agent.killedAt) return "killed";
	if (agent.withdrawalsPausedAt) return "frozen-withdrawals";
	if (agent.brainPausedAt) return "paused-brain";
	if (agent.status === "dormant") return "dormant";
	return "live";
}

/* ─── queries ─── */

export function useAdminAgents(token: string | null) {
	return useQuery<AdminAgent[]>({
		queryKey: ["admin-agents", token ?? null],
		enabled: Boolean(token),
		queryFn: async () => {
			// Try admin-scoped first; fall back to public list. Either way, the per-row
			// status fields come from the W1.8 status endpoint refresh on demand.
			let raw: unknown;
			try {
				raw = await adminGet<unknown>("/v2/agents?admin=true", token);
			} catch {
				raw = await adminGet<unknown>("/v2/agents", token);
			}
			let arr: unknown[] = [];
			if (Array.isArray(raw)) arr = raw;
			else if (raw && typeof raw === "object") {
				const obj = raw as Record<string, unknown>;
				if (Array.isArray(obj.agents)) arr = obj.agents as unknown[];
				else if (Array.isArray(obj.docs)) arr = obj.docs as unknown[];
				else if (Array.isArray(obj.items)) arr = obj.items as unknown[];
			}
			return arr.map(coerceAgent).filter((a): a is AdminAgent => a !== null);
		},
		refetchInterval: 30_000,
		retry: 1,
	});
}

export function useAdminAuditLog(opts: { token: string | null; agentId?: string | null; limit?: number }) {
	const { token, agentId, limit = 100 } = opts;
	return useQuery<{ entries: AdminAuditEntry[]; supported: boolean }>({
		queryKey: ["admin-audit-log", token ?? null, agentId ?? null, limit],
		enabled: Boolean(token),
		queryFn: async () => {
			const params = new URLSearchParams();
			params.set("limit", String(limit));
			if (agentId) params.set("agentId", agentId);
			try {
				const raw = await adminGet<unknown>(`/v2/admin/audit-log?${params.toString()}`, token);
				let arr: unknown[] = [];
				if (Array.isArray(raw)) arr = raw;
				else if (raw && typeof raw === "object") {
					const obj = raw as Record<string, unknown>;
					if (Array.isArray(obj.entries)) arr = obj.entries as unknown[];
					else if (Array.isArray(obj.logs)) arr = obj.logs as unknown[];
					else if (Array.isArray(obj.docs)) arr = obj.docs as unknown[];
				}
				const entries: AdminAuditEntry[] = arr
					.map((row, i) => {
						if (!row || typeof row !== "object") return null;
						const r = row as Record<string, unknown>;
						return {
							id: (r.id as string | number | undefined) ?? i,
							timestamp:
								(r.timestamp as string | undefined) ??
								(r.createdAt as string | undefined) ??
								(r.ts as string | undefined) ??
								new Date().toISOString(),
							agentId: (r.agentId as string | null | undefined) ?? null,
							action: (r.action as string | undefined) ?? "unknown",
							actor: (r.actor as string | null | undefined) ?? (r.adminId as string | null | undefined) ?? null,
							reason: (r.reason as string | null | undefined) ?? null,
						};
					})
					.filter((e): e is AdminAuditEntry => e !== null)
					.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
				return { entries, supported: true };
			} catch (err) {
				// TODO(W5.7): backend audit-log endpoint not yet wired; surface empty state.
				if (err instanceof Error && /404|405/.test(err.message)) {
					return { entries: [], supported: false };
				}
				throw err;
			}
		},
		refetchInterval: 60_000,
		retry: 1,
	});
}

export type AdminElizaCloudTestInput = {
	agentId?: string;
	tokenContractAddress: string;
	chain?: string;
	chainId?: number;
	tokenName?: string;
	tokenTicker?: string;
	name?: string;
	bio?: string;
	agentEvmAddress?: string;
	adminWallet?: string;
	walletKeyRef?: string;
	containerImageUri?: string;
	projectName?: string;
};

export type AdminElizaCloudWalletProvisioning = {
	id?: string;
	address?: string;
	chainType?: string;
	clientAddress?: string;
} | null;

export type AdminElizaCloudAccount = {
	primaryWalletAddress?: string | null;
	organizationId?: string;
	userId?: string;
	isNewAccount?: boolean;
	initialFreeCreditsUsd?: number;
} | null;

export type AdminElizaCloudTestResult = {
	ok: boolean;
	data?: {
		agentId: string;
		cloudAgentId: string;
		containerId?: string;
		containerUrl?: string;
		status?: string | null;
		jobId?: string;
		polling?: { endpoint: string; intervalMs: number; expectedDurationMs: number };
		walletProvisioning?: AdminElizaCloudWalletProvisioning;
		account?: AdminElizaCloudAccount;
	};
	error?: string;
	message?: string;
};

export function useElizaCloudTestProvision(token: string | null) {
	return useMutation({
		mutationFn: (body: AdminElizaCloudTestInput) =>
			adminPostJson<AdminElizaCloudTestResult>("/v2/admin/agents/eliza-cloud/test-provision", token, body),
	});
}

export type AdminElizaCloudTestEnqueueInput = AdminElizaCloudTestInput & {
	source?: "agent.graduated" | "token.migrated" | "manual";
	dryRun?: boolean;
	jobId?: string;
};

export type AdminElizaCloudTestEnqueueResult = {
	ok: boolean;
	data?: {
		enqueued: boolean;
		dryRun: boolean;
		jobId: string;
		payload: {
			agentId: string;
			source: string;
			data: Record<string, unknown>;
		};
	};
	error?: string;
	message?: string;
};

export function useElizaCloudTestEnqueueProvisioning(token: string | null) {
	return useMutation({
		mutationFn: (body: AdminElizaCloudTestEnqueueInput) =>
			adminPostJson<AdminElizaCloudTestEnqueueResult>(
				"/v2/admin/agents/eliza-cloud/test-enqueue-provisioning",
				token,
				body,
			),
	});
}

export type AdminElizaCloudRuntimeRefResult = {
	ok: boolean;
	data?: {
		agentId: string;
		cloudAgentId: string;
		containerId?: string | null;
		containerUrl?: string | null;
		status?: string | null;
		account?: AdminElizaCloudAccount;
		walletProvisioning?: AdminElizaCloudWalletProvisioning;
		polling?: Record<string, unknown> | null;
	};
	error?: string;
	message?: string;
};

function coerceRuntimeRefPending(err: unknown): AdminElizaCloudRuntimeRefResult | null {
	if (!isApiError(err) || err.status !== 409) return null;
	const details = err.details;
	if (!details || typeof details !== "object" || Array.isArray(details)) return null;
	const body = details as AdminElizaCloudRuntimeRefResult;
	if (body.error !== "RUNTIME_NOT_READY") return null;
	return body;
}

export function useElizaCloudRuntimeRef(token: string | null, agentId: string | null | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["admin-eliza-cloud-runtime-ref", token ?? null, agentId ?? null],
		enabled: Boolean(token && agentId && enabled),
		queryFn: async () => {
			try {
				return await apiFetch<AdminElizaCloudRuntimeRefResult>(
					`/v2/admin/agents/eliza-cloud/test-runtime-ref?agentId=${encodeURIComponent(agentId ?? "")}`,
					{ headers: adminHeaders(token) },
				);
			} catch (err) {
				const pending = coerceRuntimeRefPending(err);
				if (pending) return pending;
				throw err;
			}
		},
		refetchInterval: 5_000,
		retry: 1,
	});
}

export type AdminElizaCloudStatus = {
	ok: boolean;
	data?: {
		ready: boolean;
		baseUrl: string;
		checks: {
			serviceAuth: boolean;
			containerImage: boolean;
			chatAccessSecret: boolean;
			database: boolean;
			testPageEnabled: boolean;
		};
		missing: string[];
		productionGate: string | null;
	};
	error?: string;
	message?: string;
};

export function useElizaCloudStatus(token: string | null) {
	return useQuery({
		queryKey: ["admin-eliza-cloud-status", token ?? null],
		enabled: Boolean(token),
		queryFn: () => adminGet<AdminElizaCloudStatus>("/v2/admin/agents/eliza-cloud/status", token),
		refetchInterval: 30_000,
		retry: 1,
	});
}

export type AdminElizaCloudTestControlInput = {
	action: "pause" | "resume" | "restart" | "status" | "top-up" | "balance" | "verify-top-up";
	containerId?: string;
	cloudAgentId?: string;
	amountUsdCents?: number;
	sessionId?: string;
};

export type AdminElizaCloudTestControlResult = {
	ok: boolean;
	data?: {
		action: string;
		containerId?: string;
		cloudAgentId?: string;
		amountUsdCents?: number;
		checkout?: { url?: string | null; checkoutUrl?: string | null; sessionId?: string | null };
		balance?: { balance: number; totalPurchased?: number; totalSpent?: number; isLow?: boolean };
		verification?: { amount?: number; message?: string };
		status?: {
			agentId?: string;
			cloudAgentId?: string;
			containerId?: string;
			containerUrl?: string;
			status?: string;
			webUiUrl?: string | null;
			updatedAt?: string;
			updated_at?: string;
		};
		result?: unknown;
	};
	error?: string;
	message?: string;
};

export function useElizaCloudTestControl(token: string | null) {
	return useMutation({
		mutationFn: (body: AdminElizaCloudTestControlInput) =>
			adminPostJson<AdminElizaCloudTestControlResult>("/v2/admin/agents/eliza-cloud/test-control", token, body),
	});
}

/* ─── mutations ─── */

export type AdminAction = "pause-brain" | "resume-brain" | "freeze-withdrawals" | "unfreeze-withdrawals" | "kill";

export function useAdminAgentAction(token: string | null) {
	const qc = useQueryClient();
	return useMutation<AdminAgentStatus | undefined, Error, { agentId: string; action: AdminAction }>({
		mutationFn: async ({ agentId, action }) => {
			return adminPost<AdminAgentStatus | undefined>(
				`/v2/admin/agents/${encodeURIComponent(agentId)}/${action}`,
				token,
			);
		},
		onSuccess: (data, vars) => {
			// Optimistic merge into cached agent list.
			qc.setQueryData<AdminAgent[] | undefined>(["admin-agents", token ?? null], (prev) => {
				if (!prev) return prev;
				return prev.map((a) => {
					if (a.id !== vars.agentId) return a;
					const next: AdminAgent = { ...a };
					const now = new Date().toISOString();
					switch (vars.action) {
						case "pause-brain":
							next.brainPausedAt = data?.brainPausedAt ?? now;
							break;
						case "resume-brain":
							next.brainPausedAt = data?.brainPausedAt ?? null;
							break;
						case "freeze-withdrawals":
							next.withdrawalsPausedAt = data?.withdrawalsPausedAt ?? now;
							break;
						case "unfreeze-withdrawals":
							next.withdrawalsPausedAt = data?.withdrawalsPausedAt ?? null;
							break;
						case "kill":
							next.killedAt = data?.killedAt ?? now;
							break;
					}
					return next;
				});
			});
			// Refetch authoritative state.
			qc.invalidateQueries({ queryKey: ["admin-agents", token ?? null] });
			qc.invalidateQueries({ queryKey: ["admin-audit-log"] });
		},
	});
}
