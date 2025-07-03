"use client";

import { createContext, useContext, useCallback, useEffect, type ReactNode } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import type { IToken } from "@autofun/types";

export interface PendingTransaction {
	signature: string;
	token: IToken;
	mode: "buy" | "sell";
	inputAmount: number;
	expectedOutput: number;
	timestamp: number;
	confirmed?: boolean;
}

interface TransactionListenerContextType {
	pendingTransactions: PendingTransaction[];
	addTransaction: (
		signature: string,
		token: IToken,
		mode: "buy" | "sell",
		inputAmount: number,
		expectedOutput: number,
	) => void;
	clearConfirmedTransactions: () => void;
}

const TransactionListenerContext = createContext<TransactionListenerContextType | undefined>(undefined);

export const TransactionListenerProvider = ({ children }: { children: ReactNode }) => {
	const [pendingTransactions, setPendingTransactions] = useLocalStorage<PendingTransaction[]>(
		"autofun-pending-transactions",
		[],
	);
	const { connection } = useConnection();

	const addTransaction = useCallback(
		(signature: string, token: IToken, mode: "buy" | "sell", inputAmount: number, expectedOutput: number) => {
			const newTransaction: PendingTransaction = {
				signature,
				token,
				mode,
				inputAmount,
				expectedOutput,
				timestamp: Date.now(),
				confirmed: false,
			};

			setPendingTransactions((prev) => {
				const filtered = prev.filter((tx) => tx.signature !== signature);
				return [newTransaction, ...filtered];
			});

			monitorTransaction(newTransaction);
		},
		[setPendingTransactions],
	);

	const monitorTransaction = useCallback(
		async (transaction: PendingTransaction) => {
			try {
				const confirmation = await connection.confirmTransaction(transaction.signature, "confirmed");

				if (confirmation.value.err) {
					setPendingTransactions((prev) => prev.filter((tx) => tx.signature !== transaction.signature));

					toast.error(`Swap failed: ${transaction.signature.slice(0, 8)}...`, {
						action: {
							label: "View on Solscan",
							onClick: () => {
								const network = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? "?cluster=devnet" : "";
								window.open(`https://solscan.io/tx/${transaction.signature}${network}`);
							},
						},
					});
					return;
				}

				// transaction is confirmed
				setPendingTransactions((prev) =>
					prev.map((tx) => (tx.signature === transaction.signature ? { ...tx, confirmed: true } : tx)),
				);

				const inputSymbol = transaction.mode === "buy" ? "SOL" : transaction.token.ticker;
				const outputSymbol = transaction.mode === "buy" ? transaction.token.ticker : "SOL";
				const inputDecimals = transaction.mode === "buy" ? 9 : transaction.token.decimals;
				const outputDecimals = transaction.mode === "buy" ? transaction.token.decimals : 9;

				const inputFormatted = (transaction.inputAmount / 10 ** inputDecimals).toFixed(inputDecimals === 9 ? 4 : 2);
				const outputFormatted = (transaction.expectedOutput / 10 ** outputDecimals).toFixed(
					outputDecimals === 9 ? 4 : 2,
				);

				toast.success(`Swapped ${inputFormatted} ${inputSymbol} for ${outputFormatted} ${outputSymbol}`, {
					action: {
						label: "View on Solscan",
						onClick: () => {
							const network = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? "?cluster=devnet" : "";
							window.open(`https://solscan.io/tx/${transaction.signature}${network}`);
						},
					},
				});

				setTimeout(
					() => {
						setPendingTransactions((prev) => prev.filter((tx) => tx.signature !== transaction.signature));
					},
					5 * 60 * 1000,
				);
			} catch (error) {
				console.error("Error monitoring transaction:", error);
				setPendingTransactions((prev) => prev.filter((tx) => tx.signature !== transaction.signature));
			}
		},
		[connection, setPendingTransactions],
	);

	const clearConfirmedTransactions = useCallback(() => {
		setPendingTransactions((prev) => prev.filter((tx) => !tx.confirmed));
	}, [setPendingTransactions]);

	// cleanup
	useEffect(() => {
		const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
		setPendingTransactions((prev) => prev.filter((tx) => tx.timestamp > twentyFourHoursAgo));
	}, [setPendingTransactions]);

	// monitor on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: This effect runs once on mount to monitor existing transactions
	useEffect(() => {
		const unconfirmedTransactions = pendingTransactions.filter((tx) => !tx.confirmed);
		for (const tx of unconfirmedTransactions) {
			monitorTransaction(tx);
		}
	}, []);

	const value = {
		pendingTransactions,
		addTransaction,
		clearConfirmedTransactions,
	};

	return <TransactionListenerContext.Provider value={value}>{children}</TransactionListenerContext.Provider>;
};

export const useTransactionListener = () => {
	const context = useContext(TransactionListenerContext);
	if (context === undefined) {
		throw new Error("useTransactionListener must be used within a TransactionListenerProvider");
	}
	return context;
};
