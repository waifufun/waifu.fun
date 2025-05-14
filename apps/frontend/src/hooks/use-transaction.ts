"use client";
import type { EvmChainIds, ITransaction, SolanaNetworkIds, TChain } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { formatEther } from "viem";

export default function useRecentTransactions() {
	const [transactions, setTransactions] = useLocalStorage<ITransaction[]>("recent-transactions", []);
	const address = "0x...";

	async function addTransaction(txId: string, chain: TChain) {
		try {
			const txDetails = await txLookUp({
				txid: txId,
				chain: chain,
				chainId: 1,
			});

			const newTransaction: ITransaction = {
				txId,
				chain: chain,
				address,
				status: txDetails.status,
				swapDetails: {
					swapIn: `${txDetails.fromAmount}`,
					swapOut: `${txDetails.toAmount}`,
				},
				date: txDetails.date,
			};

			setTransactions((prev) => [...prev, newTransaction]);
			toast.success("Transaction added!", {
				description: `${txDetails.fromAmount} → ${txDetails.toAmount} on EVM (${txDetails.status})`,
			});
		} catch (err) {
			toast.error("Failed to add transaction");
			console.error("Add transaction failed:", err);
		}
	}
	return {
		transactions,
		addTransaction,
	};
}

export async function txLookUp({
	txid,
	chain,
}: { txid: string; chain: TChain; chainId: SolanaNetworkIds | EvmChainIds }): Promise<{
	status: "success" | "failed" | "pending" | "reverted";
	fromToken: string;
	toToken: string;
	fromAmount: number;
	toAmount: number;
	date: string;
}> {
	if (chain === "evm") {
		const client = createPublicClient({
			chain: mainnet,
			transport: http(),
		});

		try {
			const tx = await client.getTransaction({ hash: txid as `0x${string}` });
			const receipt = await client.getTransactionReceipt({ hash: txid as `0x${string}` });
			const fromAmount = Number(formatEther(tx.value));
			const block = await client.getBlock({ blockNumber: receipt.blockNumber });
			const timestamp = Number(block.timestamp) * 1000;
			const date = new Date(timestamp).toISOString();

			// for now these values are mirrored
			// until I know more about the swap events
			const toAmount = fromAmount;

			return {
				status: receipt.status,
				fromToken: "ETH",
				toToken: "ETH",
				fromAmount,
				toAmount,
				date,
			};
		} catch (err) {
			console.error("EVM tx lookup failed:", err);
			return {
				status: "failed",
				fromToken: "",
				toToken: "",
				fromAmount: 0,
				toAmount: 0,
				date: "",
			};
		}
	}

	throw new Error("Unsupported chain");
}
