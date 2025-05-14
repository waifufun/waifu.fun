"use client";

import useRecentTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";
import { useState } from "react";

export default function RecentTransactionList() {
	const { transactions, addTransaction } = useRecentTransactions();
	const [showList, setShowList] = useState(false);

	// for testing purposes, untill we have the backend setup for transactions
	const handleAdd = () => {
		addTransaction("0x2f8b11478e58be277fbbd424ec2f3739ec06b60a16c8a8d8d920d3647e97d485", "evm");
	};

	return (
		<div>
			<Button
				onClick={() => setShowList((prev) => !prev)}
				className="mb-4 px-4 py-2 bg-autofun-background-action-highlight text-black rounded-lg hover:bg-blue-700 hover:text-white transition"
			>
				{showList ? "Hide List" : "Show List"}
			</Button>

			{showList && (
				<div className="space-y-4 bg-white/10 w-fit min-w-[400px] rounded-xl p-4 shadow-lg backdrop-blur-md">
					{transactions.map((tx, _) => (
						<div key={tx.txId} className="bg-white/20 p-4 rounded-lg border border-white/30 shadow-sm space-y-1">
							<p>
								<span className="font-semibold">Swap:</span> {tx.swapDetails.swapIn} → {tx.swapDetails.swapOut}
							</p>
							<p>
								<span className="font-semibold uppercase">Chain:</span> {tx.chain}
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
