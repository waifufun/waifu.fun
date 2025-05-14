"use client";

import useTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";
import { useState } from "react";

export default function TransactionList() {
	const { transactions, addTransaction } = useTransactions();
	const [showList, setShowList] = useState(false);

	const handleAdd = () => {
		addTransaction("evm", "pending", "1 ETH", "2000 USDC", new Date().toLocaleString());
	};

	return (
		<div>
			<Button
				onClick={() => setShowList((prev) => !prev)}
				className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
			>
				{showList ? "Hide List" : "Show List"}
			</Button>

			{showList && (
				<div className="space-y-4 bg-white/10 w-fit min-w-[400px] rounded-xl p-4 shadow-lg backdrop-blur-md">
					{transactions.map((tx) => (
						<div key={tx.id} className="bg-white/20 p-4 rounded-lg border border-white/30 shadow-sm space-y-1">
							<p>
								<span className="font-semibold">Swap:</span> {tx.swapDetails.swapIn} → {tx.swapDetails.swapOut}
							</p>
							<p>
								<span className="font-semibold">Chain:</span> {tx.chain}
							</p>
							<p>
								<span className="font-semibold">Status:</span> {tx.status}
							</p>
							<p>
								<span className="font-semibold">Date:</span> {tx.date}
							</p>
						</div>
					))}
					<Button onClick={handleAdd}>Add Transaction</Button>
				</div>
			)}
		</div>
	);
}
