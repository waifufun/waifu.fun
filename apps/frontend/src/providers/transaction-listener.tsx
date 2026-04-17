"use client";

import { useTranslation } from "@/contexts/locale-context";
import { getExplorerTxUrl, resolveEvmChainId } from "@/lib/explorer";
import { DEFAULT_EVM_CHAIN_ID } from "@/providers/evm-provider";
import { useQueryClient } from "@tanstack/react-query";
import { EvmChainIds, type IToken } from "@waifufun/types";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
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

const NATIVE_SYMBOL_BY_CHAIN_ID: Record<EvmChainIds, string> = {
	[EvmChainIds.BscMainnet]: "BNB",
	[EvmChainIds.BaseMainnet]: "ETH",
	[EvmChainIds.BaseSepolia]: "ETH",
	[EvmChainIds.EthereumMainnet]: "ETH",
	[EvmChainIds.EthereumSepolia]: "ETH",
};

const getNativeSymbol = (chainId?: number) => {
	return NATIVE_SYMBOL_BY_CHAIN_ID[resolveEvmChainId(chainId)] || NATIVE_SYMBOL_BY_CHAIN_ID[DEFAULT_EVM_CHAIN_ID];
};

export const TransactionListenerProvider = ({ children }: { children: ReactNode }) => {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [pendingTransactions, setPendingTransactions] = useLocalStorage<PendingTransaction[]>(
		"waifufun-pending-transactions",
		[],
	);
	const publicClient = usePublicClient({ chainId: DEFAULT_EVM_CHAIN_ID });
	const monitoringRef = useRef<Set<string>>(new Set());
	const hasInitialized = useRef(false);
	const activeChainId = publicClient?.chain?.id ?? DEFAULT_EVM_CHAIN_ID;
	const nativeSymbol = getNativeSymbol(activeChainId);

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
				label: t("toast.viewOnBscScan"),
				onClick: () => {
					window.open(getExplorerTxUrl(newTransaction.hash, activeChainId), "_blank", "noopener,noreferrer");
				},
			};

			const inputSymbol = newTransaction.mode === "buy" ? nativeSymbol : newTransaction.token.ticker;
			const outputSymbol = newTransaction.mode === "buy" ? newTransaction.token.ticker : nativeSymbol;
			const inputDecimals = newTransaction.mode === "buy" ? 18 : newTransaction.token.decimals;
			const outputDecimals = newTransaction.mode === "buy" ? newTransaction.token.decimals : 18;
			const inputFormatted = (newTransaction.inputAmount / 10 ** inputDecimals).toFixed(inputDecimals === 18 ? 4 : 2);
			const outputFormatted = (newTransaction.expectedOutput / 10 ** outputDecimals).toFixed(
				outputDecimals === 18 ? 4 : 2,
			);

			toast.info(t("toast.swapping", { input: inputFormatted, inputSymbol, output: outputFormatted, outputSymbol }), {
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
		[activeChainId, setPendingTransactions, publicClient, t, nativeSymbol],
	);

	const showTransactionToast = useCallback(
		(transaction: PendingTransaction, success: boolean) => {
			const inputSymbol = transaction.mode === "buy" ? nativeSymbol : transaction.token.ticker;
			const outputSymbol = transaction.mode === "buy" ? transaction.token.ticker : nativeSymbol;
			const inputDecimals = transaction.mode === "buy" ? 18 : transaction.token.decimals;
			const outputDecimals = transaction.mode === "buy" ? transaction.token.decimals : 18;

			const inputFormatted = (transaction.inputAmount / 10 ** inputDecimals).toFixed(inputDecimals === 18 ? 4 : 2);
			const outputFormatted = (transaction.expectedOutput / 10 ** outputDecimals).toFixed(
				outputDecimals === 18 ? 4 : 2,
			);

			const toastAction = {
				label: t("toast.viewOnBscScan"),
				onClick: () => {
					window.open(getExplorerTxUrl(transaction.hash, activeChainId), "_blank", "noopener,noreferrer");
				},
			};

			if (success) {
				toast.success(
					t("toast.swapped", { input: inputFormatted, inputSymbol, output: outputFormatted, outputSymbol }),
					{
						action: toastAction,
					},
				);
			} else {
				toast.error(t("toast.swapFailed", { hash: transaction.hash.slice(0, 10) }), {
					action: toastAction,
				});
			}

			setPendingTransactions((prev) =>
				prev.map((tx) => (tx.hash === transaction.hash ? { ...tx, toastShown: true } : tx)),
			);
		},
		[activeChainId, setPendingTransactions, t, nativeSymbol],
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
