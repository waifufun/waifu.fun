"use client";

import useRecentTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";
import { EvmChainIds, type IRecentTransaction } from "@autofun/types";
import RecentTransactionItem from "./recent-transaction-item";

export default function RecentTransactions() {
	const { recentTransactions, addRecentTransaction } = useRecentTransactions();

	const handleAdd = () => {
		addRecentTransaction(
			"0x5cf0ed2939968755a5126d8530a8bb817788d5fa96481de27ea0475bebd5b411",
			"evm",
			EvmChainIds.EthereumMainnet,
		);
	};

	return (
		<div className="flex flex-col gap-4">
			{(recentTransactions || []).map((transaction: IRecentTransaction) => (
				<RecentTransactionItem transaction={transaction} key={`${transaction.txId}_${transaction.status}`} />
			))}
			<Button onClick={handleAdd}>Add Transaction</Button>
		</div>
	);
}
