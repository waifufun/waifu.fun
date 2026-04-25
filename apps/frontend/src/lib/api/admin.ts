"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./_fetcher";

/**
 * W5.7 — Admin (kill-switch) API client.
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
 * The token lives in localStorage under ADMIN_TOKEN_KEY. This is intentional:
 * this UI is for internal operator use, not patron-facing.
 */

export const ADMIN_TOKEN_KEY = "waifu-admin-token";

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
		return window.localStorage.getItem(ADMIN_TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setAdminToken(token: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
	} catch {
		/* localStorage may be blocked; ignored */
	}
}

export function clearAdminToken(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(ADMIN_TOKEN_KEY);
	} catch {
		/* ignored */
	}
}

function adminHeaders(token: string | null): Record<string, string> {
	// Admin operator token always wins over the Steward JWT module-global —
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
