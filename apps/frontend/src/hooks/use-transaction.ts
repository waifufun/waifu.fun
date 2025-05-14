"use client";
import type { EvmChainIds, ITransaction, SolanaNetworkIds, TChain } from "@autofun/types";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';


export default function useRecentTransactions() {
    const [transactions, setTransactions] = useLocalStorage<ITransaction[]>("recent-transactions", []);
    const address = "0x...";
  
    async function addTransaction(txId: string) {
      try {
        const txDetails = await txLookUp({
          txid: txId,
          chain: "evm",
          chainId: 1,
        });
  
        const newTransaction: ITransaction = {
          txId,
          chain: "evm",
          address,
          status: txDetails.status,
          swapDetails: {
            swapIn: `${txDetails.fromAmount}`,
            swapOut: `${txDetails.toAmount}`,
          },
          date: new Date().toISOString(), // fallback since block timestamp isn't fetched
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
    chainId,
  }: {
    txid: string;
    chain: TChain;
    chainId: SolanaNetworkIds | EvmChainIds;
  }): Promise<{
    status: "success" | "failed" | "pending";
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
  }> {
    if (chain === "evm") {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(),
      });
  
      try {
        const receipt = await client.getTransactionReceipt({
          hash: txid as `0x${string}`, // cast txid properly
        });
  
        let status: "success" | "failed" | "pending" = "pending";
        if (receipt.status === "success") status = "success";
        else if (receipt.status === "reverted" || receipt.status === "failed") status = "failed";
  
        return {
          status,
          fromToken: "",
          toToken: "",
          fromAmount: 0,
          toAmount: 0,
        };
      } catch (err) {
        console.error("EVM tx lookup failed:", err);
        return {
          status: "failed",
          fromToken: "",
          toToken: "",
          fromAmount: 0,
          toAmount: 0,
        };
      }
    }
  
    throw new Error("Unsupported chain");
  }
  