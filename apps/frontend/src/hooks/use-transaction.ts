"use client";

import type { AddressLike, IRecentTransaction, TChain, TChainId } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import type { Hash } from "viem";

export default function useRecentTransactions() {
	const [recentTransactions, setRecentTransactions] = useLocalStorage<IRecentTransaction[]>("recent-transactions", []);

	async function addRecentTransaction(from: AddressLike, txId: Hash | string, chain: TChain, chainId: TChainId) {
		/** Add that the transaction is pending */
		const a = structuredClone(recentTransactions);
		setRecentTransactions([{ from, txId, chain, chainId, status: "pending" }, ...a]);
		toast(`Transaction broadcasted: ${txId}`);
	}
	return {
		recentTransactions,
		addRecentTransaction,
	};
}
