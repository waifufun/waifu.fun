"use client";

import useRecentTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";
import { EvmChainIds, IRecentTransaction } from "@autofun/types";
import RecentTransactionItem from "./recent-transaction-item";

export default function RecentTransactions() {
	const { recentTransactions, addRecentTransaction } = useRecentTransactions();

	const handleAdd = () => {
		addRecentTransaction(
			"0x370372B10E81d255a4fEDd941412831Ab3a97f6F",
			"0xfe3aba28efdc37f351cbd2b87a67388d729a593135781e92a14a69c8ca54e7ee",
			"evm",
			EvmChainIds.EthereumMainnet,
		);
	};

	return (
		<div className="flex flex-col gap-4">
			{(recentTransactions || []).map((transaction: IRecentTransaction) => (
				<RecentTransactionItem transaction={transaction} key={transaction.txId} />
			))}
			<Button onClick={handleAdd}>Add Transaction</Button>
		</div>
	);
}
