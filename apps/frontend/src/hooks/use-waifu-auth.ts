"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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

export interface LinkedWallet {
	address: `0x${string}`;
	addedAt: string;
}

export interface WaifuMe {
	patron: WaifuPatron;
	wallets: WaifuWallet[];
	agentCount: number;
	primaryAddress: `0x${string}` | null;
	linkedWallets: LinkedWallet[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export function hasWaifuAuthCookie(cookie = typeof document === "undefined" ? "" : document.cookie): boolean {
	return cookie.split(";").some((c) => c.trim().startsWith("wf_authed=1"));
}

function normalizeAddress(address: unknown): `0x${string}` | null {
	return typeof address === "string" && address.startsWith("0x") ? (address as `0x${string}`) : null;
}

async function readJson(res: Response): Promise<unknown> {
	return res.json().catch(() => null);
}

export async function fetchWaifuMe(fetcher: typeof fetch = fetch): Promise<WaifuMe | null> {
	const v3 = await fetcher(`${API_URL}/v3/patron/me`, { credentials: "include", cache: "no-store" });
	if (v3.ok) {
		const json = (await readJson(v3)) as {
			primaryAddress?: string;
			linkedWallets?: Array<{ address?: string; addedAt?: string }>;
			patron?: Partial<WaifuPatron>;
			wallets?: WaifuWallet[];
			agentCount?: number;
		} | null;
		const primaryAddress = normalizeAddress(json?.primaryAddress ?? json?.patron?.primaryAddress);
		return {
			patron: {
				id: String(json?.patron?.id ?? ""),
				stewardUserId: json?.patron?.stewardUserId ?? null,
				email: json?.patron?.email ?? null,
				primaryAddress,
			},
			wallets: json?.wallets ?? [],
			agentCount: json?.agentCount ?? 0,
			primaryAddress,
			linkedWallets: (json?.linkedWallets ?? [])
				.map((w) => ({ address: normalizeAddress(w.address), addedAt: w.addedAt ?? "" }))
				.filter((w): w is LinkedWallet => Boolean(w.address)),
		};
	}
	if (v3.status !== 404) return null;

	// TODO(w10): remove this fallback after W10.A lands GET /v3/patron/me everywhere.
	const v2 = await fetcher(`${API_URL}/v2/patron/me`, { credentials: "include", cache: "no-store" });
	if (!v2.ok) return null;
	const json = (await readJson(v2)) as
		| { ok: true; patron: WaifuPatron; wallets?: WaifuWallet[]; agentCount?: number }
		| { ok: false }
		| null;
	if (!json || !("ok" in json) || json.ok !== true) return null;
	const primaryAddress = normalizeAddress(
		json.patron.primaryAddress ?? json.wallets?.find((w) => w.isPrimary)?.address ?? json.wallets?.[0]?.address,
	);
	return {
		patron: { ...json.patron, primaryAddress },
		wallets: json.wallets ?? [],
		agentCount: json.agentCount ?? 0,
		primaryAddress,
		linkedWallets: [],
	};
}

export function useWaifuAuth() {
	const authed = hasWaifuAuthCookie();
	const query = useQuery<WaifuMe | null, Error>({
		queryKey: ["waifu-me"],
		queryFn: () => fetchWaifuMe(),
		enabled: authed,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		retry: 1,
	});

	const primaryAddress = useMemo(() => query.data?.primaryAddress ?? null, [query.data?.primaryAddress]);
	const isAuthenticated = authed && Boolean(query.data?.primaryAddress) && !query.error;
	const isLoading = authed && query.isLoading;

	return {
		isAuthenticated,
		isLoading,
		primaryAddress,
		me: {
			data: query.data ?? null,
			address: primaryAddress,
			loading: isLoading,
			error: query.error ?? null,
		},
		refetch: query.refetch,
	};
}

export function useWaifuMe() {
	const auth = useWaifuAuth();
	return {
		me: auth.me.data,
		isAuthenticated: auth.isAuthenticated,
		isLoading: auth.isLoading,
		refetch: auth.refetch,
	};
}
