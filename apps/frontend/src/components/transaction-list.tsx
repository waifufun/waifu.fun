"use client";

import useRecentTransactions from "@/hooks/use-transaction";
import { Button } from "./ui/button";
import { useState } from "react";

export default function RecentTransactionList() {
	const { transactions, addTransaction } = useRecentTransactions();
	const [showList, setShowList] = useState(false);

	// for testing purposes, untill we have the backend setup for transactions
	const handleAdd = () => {
		addTransaction("0x0a2800c8965beb4a3660f5f7a74592749a320cc2a28b1bc4e6445bf18122dd96", "evm");
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
								<span className="font-semibold">Date: </span>
								{new Date(tx.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
							</p>
						</div>
					))}
					<Button onClick={handleAdd}>Add Transaction</Button>
				</div>
			)}
		</div>
	);
}
