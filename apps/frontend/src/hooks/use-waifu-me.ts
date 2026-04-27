"use client";

import { useQuery } from "@tanstack/react-query";

import { useWaifuAuth } from "@/hooks/use-waifu-auth";

export interface WaifuPatron {
	id: string;
	stewardUserId: string | null;
	email: string | null;
	primaryAddress: string | null;
}

export interface WaifuWallet {
	id: string;
	address: string;
	chainId: number;
	isPrimary: boolean;
	linkedAt: string;
}

export interface WaifuMe {
	patron: WaifuPatron;
	wallets: WaifuWallet[];
	agentCount: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

async function fetchMe(): Promise<WaifuMe | null> {
	const res = await fetch(`${API_URL}/v2/patron/me`, {
		credentials: "include",
		cache: "no-store",
	});
	if (!res.ok) return null;
	const json = (await res.json()) as
		| {
				ok: true;
				patron: WaifuPatron;
				wallets: WaifuWallet[];
				agentCount: number;
		  }
		| { ok: false };
	if (!json || !("ok" in json) || json.ok !== true) return null;
	return {
		patron: json.patron,
		wallets: json.wallets ?? [],
		agentCount: json.agentCount ?? 0,
	};
}

/**
 * The canonical hook for "is the user signed in, and what's their info?".
 * Reads the wf_authed presence cookie via useWaifuAuth, then fetches the
 * full patron payload from /v2/patron/me.
 */
export function useWaifuMe() {
	const { isAuthenticated, isLoading: authLoading } = useWaifuAuth();

	const query = useQuery<WaifuMe | null>({
		queryKey: ["waifu-me"],
		queryFn: fetchMe,
		enabled: isAuthenticated,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		retry: 1,
	});

	return {
		me: query.data ?? null,
		isAuthenticated,
		isLoading: authLoading || (isAuthenticated && query.isLoading),
		refetch: query.refetch,
	};
}
