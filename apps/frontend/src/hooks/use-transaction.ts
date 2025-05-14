"use client";
import type { ITransaction, TChain } from "@autofun/types";
import { useState } from "react";
import { toast } from "sonner";

export default function useTransactions() {
	const [transactions, setTransactions] = useState<ITransaction[]>([]);

	function addTransaction(
		chain: TChain,
		status: "pending" | "success" | "failed",
		swapIn: string,
		swapOut: string,
		date: string,
	) {
		const newTransaction: ITransaction = {
			id: crypto.randomUUID(),
			chain,
			status,
			swapDetails: { swapIn, swapOut },
			date,
		};

		setTransactions((prev) => [...prev, newTransaction]);

		toast.success("Transaction added!", {
			description: `${swapIn} → ${swapOut} on ${chain} (${status})`,
		});
	}

	return {
		transactions,
		addTransaction,
	};
}
