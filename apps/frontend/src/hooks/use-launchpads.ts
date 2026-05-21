"use client";

import { LAUNCHPAD_DISPLAY_ORDER, MOCK_LAUNCHPADS } from "@/lib/launchpad/mock-descriptors";
import type { LaunchpadDescriptor, LaunchpadId } from "@/lib/launchpad/types";
import { useEffect, useState } from "react";

// Same-origin path for credentialed XHR — see src/lib/same-origin-api.ts.
import { SAME_ORIGIN_API } from "@/lib/same-origin-api";
const API_URL = SAME_ORIGIN_API;

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
 * if the endpoint 404s or is unreachable.
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

export type WaitlistSignupResult =
	| { ok: true; status: "created" | "already"; email: string }
	| { ok: false; error: string };

type WaitlistErrorBody = {
	error?: string;
	message?: string;
	code?: string;
};

function waitlistErrorMessage(status: number, body: WaitlistErrorBody): string {
	if (status === 400 || status === 422) return body.error ?? body.message ?? "check the email and try again.";
	if (status === 404) return "waitlist is not available for this launchpad yet.";
	if (status === 429) return "too many attempts. wait a minute and try again.";
	if (status >= 500) return "waitlist service is having trouble. try again soon.";
	return body.error ?? body.message ?? `signup failed with status ${status}.`;
}

export function parseWaitlistResponse(status: number, body: WaitlistErrorBody = {}): WaitlistSignupResult {
	if (status >= 200 && status < 300) {
		return { ok: true, status: "created", email: "" };
	}
	if (status === 409 || body.code === "already_joined" || body.code === "duplicate") {
		return { ok: true, status: "already", email: "" };
	}
	return { ok: false, error: waitlistErrorMessage(status, body) };
}

/** POSTs a waitlist signup to the backend launchpad waitlist route. */
export async function postWaitlistSignup(launchpadId: LaunchpadId, email: string): Promise<WaitlistSignupResult> {
	const trimmed = email.trim().toLowerCase();
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
		const body = (await res.json().catch(() => ({}))) as WaitlistErrorBody;
		const parsed = parseWaitlistResponse(res.status, body);
		return parsed.ok ? { ...parsed, email: trimmed } : parsed;
	} catch {
		return { ok: false, error: "could not reach the waitlist service. try again when your connection is stable." };
	}
}
