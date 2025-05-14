"use client";
import type { EvmChainIds, ITransaction, SolanaNetworkIds, TChain } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { formatEther } from "viem";
import { Connection } from "@solana/web3.js";

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
				description: `${txDetails.fromAmount} → ${txDetails.toAmount} on ${chain} (${txDetails.status})`,
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
			// I need the ERC-20 ABI
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
			return { status: "failed", fromToken: "", toToken: "", fromAmount: 0, toAmount: 0, date: "" };
		}
	} else if (chain === "solana") {
		// use the constants for rpc url!
		const heliusApiKey = process.env.HELIUS_API_KEY;
		const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`);
		const signature = txid;
		const tx = await connection.getParsedTransaction(signature, {
			maxSupportedTransactionVersion: 0,
		});
		const logs = tx?.meta?.logMessages || [];

		let amount_in: string | null = null;
		let minimum_amount_out: string | null = null;

		for (const log of logs) {
			const match = log.match(/amount_in:\s*(\d+),\s*minimum_amount_out:\s*(\d+)/);
			if (match) {
				amount_in = match[1];
				minimum_amount_out = match[2];
				break;
			}
		}
		const fromAmount = amount_in ? Number.parseInt(amount_in, 10) : 0;
		const toAmount = minimum_amount_out ? Number.parseInt(minimum_amount_out, 10) : 0;
		const date = new Date(tx?.blockTime * 1000).toISOString();

		if (!tx) throw new Error("Transaction not found");

		return {
			status: "success",
			fromToken: "Sol",
			toToken: "Sol",
			fromAmount,
			toAmount,
			date,
		};
	}

	throw new Error("Unsupported chain");
}
