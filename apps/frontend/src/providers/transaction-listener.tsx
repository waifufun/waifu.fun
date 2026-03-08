"use client";

import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";
import type { IToken } from "@waifufun/types";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

export interface PendingTransaction {
	hash: string;
	token: IToken;
	mode: "buy" | "sell";
	inputAmount: number;
	expectedOutput: number;
	timestamp: number;
	confirmed?: boolean;
	toastShown?: boolean;
}

interface TransactionListenerContextType {
	pendingTransactions: PendingTransaction[];
	addTransaction: (
		hash: string,
		token: IToken,
		mode: "buy" | "sell",
		inputAmount: number,
		expectedOutput: number,
	) => void;
	clearConfirmedTransactions: () => void;
}

const TransactionListenerContext = createContext<TransactionListenerContextType | undefined>(undefined);

export const TransactionListenerProvider = ({ children }: { children: ReactNode }) => {
	const queryClient = useQueryClient();
	const [pendingTransactions, setPendingTransactions] = useLocalStorage<PendingTransaction[]>(
		"waifufun-pending-transactions",
		[],
	);
	const publicClient = usePublicClient();
	const monitoringRef = useRef<Set<string>>(new Set());
	const hasInitialized = useRef(false);

	const addTransaction = useCallback(
		(hash: string, token: IToken, mode: "buy" | "sell", inputAmount: number, expectedOutput: number) => {
			const newTransaction: PendingTransaction = {
				hash,
				token,
				mode,
				inputAmount,
				expectedOutput,
				timestamp: Date.now(),
				confirmed: false,
				toastShown: false,
			};

			const toastAction = {
				label: "View on BscScan",
				onClick: () => {
					window.open(`https://bscscan.com/tx/${newTransaction.hash}`);
				},
			};

			const inputSymbol = newTransaction.mode === "buy" ? "BNB" : newTransaction.token.ticker;
			const outputSymbol = newTransaction.mode === "buy" ? newTransaction.token.ticker : "BNB";
			const inputDecimals = newTransaction.mode === "buy" ? 18 : newTransaction.token.decimals;
			const outputDecimals = newTransaction.mode === "buy" ? newTransaction.token.decimals : 18;
			const inputFormatted = (newTransaction.inputAmount / 10 ** inputDecimals).toFixed(inputDecimals === 18 ? 4 : 2);
			const outputFormatted = (newTransaction.expectedOutput / 10 ** outputDecimals).toFixed(
				outputDecimals === 18 ? 4 : 2,
			);

			toast.info(`Swapping ${inputFormatted} ${inputSymbol} for ${outputFormatted} ${outputSymbol}`, {
				action: toastAction,
			});

			setPendingTransactions((prev) => {
				const filtered = prev.filter((tx) => tx.hash !== hash);
				return [newTransaction, ...filtered];
			});

			if (publicClient) {
				monitorTransaction(newTransaction);
			}
		},
		[setPendingTransactions, publicClient],
	);

	const showTransactionToast = useCallback(
		(transaction: PendingTransaction, success: boolean) => {
			const inputSymbol = transaction.mode === "buy" ? "BNB" : transaction.token.ticker;
			const outputSymbol = transaction.mode === "buy" ? transaction.token.ticker : "BNB";
			const inputDecimals = transaction.mode === "buy" ? 18 : transaction.token.decimals;
			const outputDecimals = transaction.mode === "buy" ? transaction.token.decimals : 18;

			const inputFormatted = (transaction.inputAmount / 10 ** inputDecimals).toFixed(inputDecimals === 18 ? 4 : 2);
			const outputFormatted = (transaction.expectedOutput / 10 ** outputDecimals).toFixed(
				outputDecimals === 18 ? 4 : 2,
			);

			const toastAction = {
				label: "View on BscScan",
				onClick: () => {
					window.open(`https://bscscan.com/tx/${transaction.hash}`);
				},
			};

			if (success) {
				toast.success(`Swapped ${inputFormatted} ${inputSymbol} for ${outputFormatted} ${outputSymbol}`, {
					action: toastAction,
				});
			} else {
				toast.error(`Swap failed: ${transaction.hash.slice(0, 10)}...`, {
					action: toastAction,
				});
			}

			setPendingTransactions((prev) =>
				prev.map((tx) => (tx.hash === transaction.hash ? { ...tx, toastShown: true } : tx)),
			);
		},
		[setPendingTransactions],
	);

	const monitorTransaction = useCallback(
		async (transaction: PendingTransaction) => {
			if (!publicClient) return;
			if (monitoringRef.current.has(transaction.hash)) return;

			monitoringRef.current.add(transaction.hash);

			try {
				const receipt = await publicClient.waitForTransactionReceipt({
					hash: transaction.hash as `0x${string}`,
				});

				const success = receipt.status === "success";

				queryClient.invalidateQueries({ queryKey: ["balance"] });
				queryClient.invalidateQueries({ queryKey: ["chart"] });
				queryClient.invalidateQueries({ queryKey: ["trades"] });

				setPendingTransactions((prev) =>
					prev.map((tx) => (tx.hash === transaction.hash ? { ...tx, confirmed: true } : tx)),
				);

				if (!transaction.toastShown) {
					showTransactionToast(transaction, success);
				}

				// cleanup after 5 minutes
				setTimeout(
					() => {
						setPendingTransactions((prev) => prev.filter((tx) => tx.hash !== transaction.hash));
					},
					5 * 60 * 1000,
				);
			} catch (error) {
				console.error("Error monitoring transaction:", error);
				setPendingTransactions((prev) => prev.filter((tx) => tx.hash !== transaction.hash));
			} finally {
				monitoringRef.current.delete(transaction.hash);
			}
		},
		[publicClient, setPendingTransactions, showTransactionToast, queryClient],
	);

	const clearConfirmedTransactions = useCallback(() => {
		setPendingTransactions((prev) => prev.filter((tx) => !tx.confirmed));
	}, [setPendingTransactions]);

	// monitor all transactions that haven't shown toast yet
	useEffect(() => {
		if (!publicClient || hasInitialized.current) return;

		const unprocessedTransactions = pendingTransactions.filter((tx) => !tx.toastShown);

		if (unprocessedTransactions.length > 0) {
			console.log(`Checking status for ${unprocessedTransactions.length} unprocessed transactions`);
			for (const tx of unprocessedTransactions) {
				monitorTransaction(tx);
			}
		}

		hasInitialized.current = true;
	}, [publicClient, pendingTransactions, monitorTransaction]);

	// reset if client changes
	useEffect(() => {
		if (publicClient) {
			hasInitialized.current = false;
		}
	}, [publicClient]);

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
