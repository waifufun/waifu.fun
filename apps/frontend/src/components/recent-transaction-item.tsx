"use client";

import type { EvmChainIds, IRecentTransaction } from "@autofun/types";
import { CHAINID_TO_VIEM_CHAIN } from "@autofun/constants";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, erc20Abi, getAddress, type Hash, http, parseEventLogs } from "viem";
import { Check, Clock, Cross, ExternalLink } from "lucide-react";

export default function RecentTransactionItem({ transaction }: { transaction: IRecentTransaction }) {
	const query = useQuery({
		queryKey: ["recent-transaction", transaction.txId],
		queryFn: async () => {
			if (transaction.chain === "evm") {
				/** Start listening to the transaction to see what is going on */
				const client = createPublicClient({
					chain: CHAINID_TO_VIEM_CHAIN[transaction.chainId as EvmChainIds],
					transport: http(),
				});

				const receipt = await client.waitForTransactionReceipt({
					hash: transaction.txId as Hash,
				});

				const fromAddress = getAddress(transaction.from);

				/** Retrieve the transers */
				const logs = parseEventLogs({
					abi: erc20Abi,
					logs: receipt.logs,
				});

				for (const log of logs) {
					if (log?.args?.from === fromAddress || log?.args?.to === fromAddress) {
						console.log(log);
					}
				}

				console.log(receipt);

				return receipt;
			}

			return transaction;
		},
		initialData: transaction,
		enabled: transaction.status === "pending", // Only look into the transaction if it's still marked as pending
	});

	console.log(query?.data);

	const parsedTransaction = query?.data;

	return (
		<div className="flex gap-2 items-center">
			<div>
				{parsedTransaction?.status === "pending" ? (
					<Clock />
				) : parsedTransaction?.status === "reverted" ? (
					<Cross />
				) : parsedTransaction?.status === "success" ? (
					<Check />
				) : (
					"-"
				)}
			</div>
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<span>Swap</span>
					<ExternalLink className="size-4 text-autofun-text-secondary cursor-pointer" />
				</div>
				<span>Swap 5000 USDT for 11 SOL</span>
			</div>
			<div>Icons</div>
		</div>
	);
}
