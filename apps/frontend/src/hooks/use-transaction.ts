"use client";

import type { IRecentTransaction, TChain, TChainId } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import type { Hash } from "viem";

export default function useRecentTransactions() {
	const [recentTransactions, setRecentTransactions] = useLocalStorage<IRecentTransaction[]>(
		"recent-transactions-autofun",
		[],
	);

	async function addRecentTransaction(txId: Hash | string, chain: TChain, chainId: TChainId) {
		const a = structuredClone(recentTransactions);
		setRecentTransactions([{ txId, chain, chainId, status: "pending" }, ...a]);
		toast(`Transaction broadcasted: ${txId}`);
	}
	return {
		recentTransactions,
		addRecentTransaction,
	};
}
