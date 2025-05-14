"use client";

import useTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";

export default function TransactionList() {
	const { transactions, addTransaction } = useTransactions();

	const handleAdd = () => {
		addTransaction("evm", "pending", "1 ETH", "2000 USDC", new Date().toLocaleString());
	};
	if (transactions.length === 0)
		return (
			<>
				<p>No transactions yet.</p>
			</>
		);

	return (
		<div className="space-y-2 bg-white/10 w-fit rounded-lg">
			{transactions.map((tx) => (
				<div key={tx.id} className="p-4">
					<p>
						<strong>Swap:</strong> {tx.swapDetails.swapIn} → {tx.swapDetails.swapOut}
					</p>
					<p>
						<strong>Chain:</strong> {tx.chain}
					</p>
					<p>
						<strong>Status:</strong> {tx.status}
					</p>
					<p>
						<strong>Date:</strong> {tx.date}
					</p>
				</div>
			))}
		</div>
	);
}
