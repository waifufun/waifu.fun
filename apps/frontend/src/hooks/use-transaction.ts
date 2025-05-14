"use client";
import type { ITransaction, TChain } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts"

export default function useRecentTransactions() {
    const [transactions, setTransactions] = useLocalStorage<ITransaction[]>(
		"recent-transactions",
		[]
	);
	function addTransaction(
		chain: TChain,
		status: "pending" | "success" | "failed",
		swapIn: string,
		swapOut: string,
		date: string,
	) {
		const newTransaction: ITransaction = {
			txId: crypto.randomUUID(),
			chain,
			address: "0ximplememntedsoon",
			status,
			swapDetails: { swapIn, swapOut },
			date,
		};

		setTransactions((prev) => [...prev, newTransaction]);

		toast.success("Transaction created!", {
			description: `${swapIn} → ${swapOut} on ${chain} (${status})`,
		});
	}

	return {
		transactions,
		addTransaction,
	};
}
