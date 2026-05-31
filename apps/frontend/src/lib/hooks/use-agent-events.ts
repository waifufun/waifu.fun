"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api/_fetcher";

export type AgentEvent = {
	id: string;
	agentId: string;
	eventType: string;
	data: { template?: string; renderedText?: string; [k: string]: unknown };
	payload: Record<string, unknown>;
	txHash: string | null;
	blockNumber: string | null;
	chainId: string | null;
	tokenAddress: string | null;
	type: string;
	status: string;
	createdAt: string;
	/**
	 * On-chain / source time of the event (e.g. the matching fill time for a
	 * trade.open). Prefer this over createdAt (ingestion time) when rendering
	 * relative timestamps in the feed.
	 */
	occurredAt?: string | null;
	grouped?: true;
	count?: number;
	items?: AgentEvent[];
};

type UseAgentEventsOptions = {
	pollMs?: number;
	limit?: number;
	types?: string[];
};

type AgentEventsResponse = {
	events?: AgentEvent[];
	nextCursor?: string | null;
};

function toError(value: unknown): Error {
	if (value instanceof Error) return value;
	if (value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string") {
		return new Error((value as { message: string }).message);
	}
	return new Error(String(value));
}

export function useAgentEvents(
	agentId: string | null,
	options: UseAgentEventsOptions = {},
): { events: AgentEvent[]; isLoading: boolean; error: Error | null } {
	const { pollMs = 15_000, limit = 50, types } = options;
	const typesKey = useMemo(() => (types ?? []).join(","), [types]);
	const [events, setEvents] = useState<AgentEvent[]>([]);
	const [isLoading, setIsLoading] = useState(Boolean(agentId));
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!agentId) {
			setEvents([]);
			setIsLoading(false);
			setError(null);
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let inFlight = false;
		const params = new URLSearchParams({ limit: String(limit) });
		if (typesKey) params.set("types", typesKey);
		const path = `/v2/agents/${encodeURIComponent(agentId)}/events?${params.toString()}`;

		const schedule = () => {
			if (cancelled || pollMs <= 0) return;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				void load();
			}, pollMs);
		};

		const load = async () => {
			if (cancelled || inFlight) return;
			if (typeof document !== "undefined" && document.hidden) {
				schedule();
				return;
			}
			inFlight = true;
			try {
				const data = await apiFetch<AgentEventsResponse>(path);
				if (!cancelled) {
					setEvents(Array.isArray(data.events) ? data.events : []);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) setError(toError(err));
			} finally {
				inFlight = false;
				if (!cancelled) setIsLoading(false);
				schedule();
			}
		};

		const onVisibilityChange = () => {
			if (typeof document !== "undefined" && !document.hidden) void load();
		};

		setIsLoading(true);
		void load();
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", onVisibilityChange);
		}

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			if (typeof document !== "undefined") {
				document.removeEventListener("visibilitychange", onVisibilityChange);
			}
		};
	}, [agentId, limit, pollMs, typesKey]);

	return { events, isLoading, error };
}
