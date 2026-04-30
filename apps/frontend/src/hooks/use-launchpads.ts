"use client";

import { useEffect, useState } from "react";
import { LAUNCHPAD_DISPLAY_ORDER, MOCK_LAUNCHPADS } from "@/lib/launchpad/mock-descriptors";
import type { LaunchpadDescriptor, LaunchpadId } from "@/lib/launchpad/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export type UseLaunchpads = {
	launchpads: LaunchpadDescriptor[];
	isLoading: boolean;
	error: Error | null;
	source: "api" | "mock";
};

const order: Record<LaunchpadId, number> = LAUNCHPAD_DISPLAY_ORDER.reduce(
	(acc, id, i) => {
		acc[id] = i;
		return acc;
	},
	{} as Record<LaunchpadId, number>,
);

function sortByDisplayOrder(list: LaunchpadDescriptor[]): LaunchpadDescriptor[] {
	return [...list].sort((a, b) => (order[a.id] ?? 999) - (order[b.id] ?? 999));
}

/**
 * SWR-style fetcher for /v3/launchpads. Falls back to local mock descriptors
 * if the endpoint 404s or is unreachable (i.e. before W1.A merges).
 */
export function useLaunchpads(): UseLaunchpads {
	const [launchpads, setLaunchpads] = useState<LaunchpadDescriptor[]>(() => sortByDisplayOrder(MOCK_LAUNCHPADS));
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [source, setSource] = useState<"api" | "mock">("mock");

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch(`${API_URL}/v3/launchpads`, { credentials: "include" });
				if (!res.ok) {
					if (cancelled) return;
					setSource("mock");
					setError(null);
					return;
				}
				const data = (await res.json()) as { launchpads?: LaunchpadDescriptor[] } | LaunchpadDescriptor[];
				const list = Array.isArray(data) ? data : (data.launchpads ?? []);
				if (cancelled) return;
				if (list.length === 0) {
					setSource("mock");
					return;
				}
				setLaunchpads(sortByDisplayOrder(list));
				setSource("api");
				setError(null);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err : new Error("failed to fetch launchpads"));
				setSource("mock");
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	return { launchpads, isLoading, error, source };
}

/** POSTs a waitlist signup. Treats 404 / network errors as "stub success". */
export async function postWaitlistSignup(
	launchpadId: LaunchpadId,
	email: string,
): Promise<{ ok: true; stub: boolean } | { ok: false; error: string }> {
	const trimmed = email.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		return { ok: false, error: "enter a valid email address." };
	}
	try {
		const res = await fetch(`${API_URL}/v3/launchpads/${encodeURIComponent(launchpadId)}/waitlist`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ email: trimmed }),
		});
		if (res.ok) return { ok: true, stub: false };
		if (res.status === 404) return { ok: true, stub: true };
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		return { ok: false, error: body.error ?? `signup failed (${res.status}).` };
	} catch {
		return { ok: true, stub: true };
	}
}
