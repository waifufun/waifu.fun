"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type WalletChain = "evm" | "solana";

export interface WaifuPatron {
	id: string;
	stewardUserId: string | null;
	email: string | null;
	primaryAddress: string | null;
	primaryChain: WalletChain | null;
}

export interface WaifuWallet {
	id: string;
	address: string;
	chainId: number;
	chainNamespace?: WalletChain;
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
	primaryAddress: string | null;
	primaryChain: WalletChain | null;
	linkedWallets: LinkedWallet[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export function hasWaifuAuthCookie(cookie = typeof document === "undefined" ? "" : document.cookie): boolean {
	return cookie.split(";").some((c) => c.trim().startsWith("wf_authed=1"));
}

function normalizeAddress(address: unknown): string | null {
	return typeof address === "string" && address.length > 0 ? address : null;
}

function normalizeEvmAddress(address: unknown): `0x${string}` | null {
	return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address) ? (address as `0x${string}`) : null;
}

function normalizeChain(chain: unknown): WalletChain | null {
	return chain === "evm" || chain === "solana" ? chain : null;
}

function inferChain(address: string | null): WalletChain | null {
	if (!address) return null;
	return address.startsWith("0x") ? "evm" : "solana";
}

async function readJson(res: Response): Promise<unknown> {
	return res.json().catch(() => null);
}

export async function fetchWaifuMe(fetcher: typeof fetch = fetch): Promise<WaifuMe | null> {
	const v3 = await fetcher(`${API_URL}/v3/patron/me`, { credentials: "include", cache: "no-store" });
	if (v3.ok) {
		const json = (await readJson(v3)) as {
			primaryAddress?: string;
			primaryChain?: WalletChain;
			linkedWallets?: Array<{ address?: string; addedAt?: string }>;
			patron?: Partial<WaifuPatron>;
			wallets?: WaifuWallet[];
			agentCount?: number;
		} | null;
		const primaryAddress = normalizeAddress(json?.primaryAddress ?? json?.patron?.primaryAddress);
		const primaryChain = normalizeChain(json?.primaryChain ?? json?.patron?.primaryChain) ?? inferChain(primaryAddress);
		return {
			patron: {
				id: String(json?.patron?.id ?? ""),
				stewardUserId: json?.patron?.stewardUserId ?? null,
				email: json?.patron?.email ?? null,
				primaryAddress,
				primaryChain,
			},
			wallets: json?.wallets ?? [],
			agentCount: json?.agentCount ?? 0,
			primaryAddress,
			primaryChain,
			linkedWallets: (json?.linkedWallets ?? [])
				.map((w) => ({ address: normalizeEvmAddress(w.address), addedAt: w.addedAt ?? "" }))
				.filter((w): w is LinkedWallet => Boolean(w.address)),
		};
	}
	if (v3.status !== 404) return null;

	// TODO(w10): remove this fallback after W10.A lands GET /v3/patron/me everywhere.
	const v2 = await fetcher(`${API_URL}/v2/patron/me`, { credentials: "include", cache: "no-store" });
	if (!v2.ok) return null;
	const json = (await readJson(v2)) as
		| { ok: true; patron: WaifuPatron; primaryChain?: WalletChain; wallets?: WaifuWallet[]; agentCount?: number }
		| { ok: false }
		| null;
	if (!json || !("ok" in json) || json.ok !== true) return null;
	const primaryAddress = normalizeAddress(
		json.patron.primaryAddress ?? json.wallets?.find((w) => w.isPrimary)?.address ?? json.wallets?.[0]?.address,
	);
	const primaryChain =
		normalizeChain(
			json.primaryChain ??
				json.patron.primaryChain ??
				json.wallets?.find((w) => w.address === primaryAddress)?.chainNamespace,
		) ?? inferChain(primaryAddress);
	return {
		patron: { ...json.patron, primaryAddress, primaryChain },
		wallets: json.wallets ?? [],
		agentCount: json.agentCount ?? 0,
		primaryAddress,
		primaryChain,
		linkedWallets: [],
	};
}

function clearStaleAuthCookie(): void {
	if (typeof document === "undefined") return;
	// Best-effort delete on the .waifu.fun root domain (where auth/finalize
	// originally set it). Browsers ignore Set-Cookie writes for paths/domains
	// they don't match, so this is safe even when the cookie was set elsewhere.
	document.cookie = "wf_authed=; Path=/; Max-Age=0; SameSite=Lax";
	document.cookie = "wf_authed=; Path=/; Domain=.waifu.fun; Max-Age=0; SameSite=Lax";
}

export function useWaifuAuth() {
	const authed = hasWaifuAuthCookie();
	const query = useQuery<WaifuMe | null, Error>({
		queryKey: ["waifu-me"],
		queryFn: () => fetchWaifuMe(),
		enabled: authed,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		// Don't retry: a 401 means the session is dead, retrying just keeps
		// the auth-loading spinner spinning forever and disables the sign-in
		// button. One shot, fail fast, fall through to the unauth path.
		retry: false,
	});

	// If the cookie says we're authed but the patron lookup returns null /
	// errors with 401, the session was invalidated server-side (logout, JWT
	// expired, etc). Clear the stale cookie so the UI flips to unauth
	// instead of being stuck in an "authed but no patron" limbo.
	if (typeof document !== "undefined" && authed && (query.error || (query.isFetched && !query.data))) {
		clearStaleAuthCookie();
	}

	const primaryAddress = useMemo(() => query.data?.primaryAddress ?? null, [query.data?.primaryAddress]);
	const primaryChain = useMemo(() => query.data?.primaryChain ?? null, [query.data?.primaryChain]);
	const isAuthenticated = authed && Boolean(query.data?.primaryAddress) && !query.error;
	const isLoading = authed && query.isLoading;

	return {
		isAuthenticated,
		isLoading,
		primaryAddress,
		primaryChain,
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
