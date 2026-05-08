"use client";

import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useMemo } from "react";
import { useAccount, useSignMessage } from "wagmi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export function buildLinkedEoaMessage(address: string): string {
	return `Link ${address} to your waifu.fun patron account.`;
}

export function isAddressLinked(address: string | undefined, linkedWallets: Array<{ address: string }>): boolean {
	if (!address) return false;
	return linkedWallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
}

export function useLinkedEoa() {
	const { address, isConnected } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const { openConnectModal } = useConnectModal();
	const { me, refetch } = useWaifuAuth();
	const linkedWallets = me.data?.linkedWallets ?? [];
	const isLinkedToPatron = useMemo(() => isAddressLinked(address, linkedWallets), [address, linkedWallets]);

	const link = useCallback(async () => {
		if (!isConnected || !address) {
			throw new Error("connect a third-party wallet before linking it");
		}
		if (isAddressLinked(address, linkedWallets)) return;
		const message = buildLinkedEoaMessage(address);
		const signature = await signMessageAsync({ message });
		const res = await fetch(`${API_URL}/v3/patron/wallets/link`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ address, signature, message }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
			throw new Error(body?.message ?? body?.error ?? "could not link wallet");
		}
		await refetch();
	}, [address, isConnected, linkedWallets, refetch, signMessageAsync]);

	const unlink = useCallback(
		async (walletAddress: string) => {
			const res = await fetch(`${API_URL}/v3/patron/wallets/link/${walletAddress}`, {
				method: "DELETE",
				credentials: "include",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
				throw new Error(body?.message ?? body?.error ?? "could not unlink wallet");
			}
			await refetch();
		},
		[refetch],
	);

	return {
		address: address ?? null,
		isConnected,
		isLinkedToPatron,
		link,
		unlink,
		openConnectModal: openConnectModal ?? (() => undefined),
	};
}
