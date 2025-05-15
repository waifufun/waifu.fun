"use client";

import { getTransaction } from "@/lib/api";
import type { IRecentTransaction } from "@autofun/types";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Cross, ExternalLink } from "lucide-react";

export default function RecentTransactionItem({
  transaction,
}: {
  transaction: IRecentTransaction;
}) {
  const query = useQuery({
    queryKey: ["recent-transaction", transaction.txId],
    queryFn: async () => {
      return await getTransaction({
        chain: transaction.chain,
        chainId: transaction.chainId,
        txId: transaction.txId,
      });
    },
    initialData: transaction,
    refetchInterval: transaction?.status ? 10_000 : false,
    enabled: transaction.status === "pending", // Only look into the transaction if it's still marked as pending
  });

  const parsedTransaction = query?.data as IRecentTransaction;

  return (
    <div className="flex gap-4 items-center">
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
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium">Swap</span>
          <ExternalLink className="size-4 text-autofun-text-secondary cursor-pointer" />
        </div>
        <span className="text-sm">
          Swap {parsedTransaction?.input?.amountFormatted}{" "}
          {parsedTransaction?.input?.symbol} for{" "}
          {parsedTransaction?.output?.amountFormatted}{" "}
          {parsedTransaction?.output?.symbol}{" "}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
