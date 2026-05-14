"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVaultUserPosition } from "@/hooks/use-launch-vault";
import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { cn } from "@/lib/utils";

import { computeBonusShare, normalizeRefundError } from "./refund-widget-logic";

type Props = {
	vault: Address | undefined;
	/** Current total deposited in the vault, used to compute bonus pro-rata. */
	totalDeposited: bigint;
	/** Vault bonus pool snapshot in wei. */
	bonusPool: bigint | null;
	/** Mobile-only sticky positioning. Desktop sidebar uses sticky-top. */
	sticky?: "top" | "bottom";
	className?: string;
	onUserStateChanged?: () => void;
};

/**
 * Refund widget for the `refunding` display state.
 *
 * Calls `LaunchVault.refund()` which returns the depositor's principal plus
 * their pro-rata share of the bonus pool. Idempotent on-chain: a second call
 * from the same address reverts with `NoDeposit()`. We hide the action once
 * the user's recorded deposit is zero.
 */
export function RefundWidget({
	vault,
	totalDeposited,
	bonusPool,
	sticky = "top",
	className,
	onUserStateChanged,
}: Props) {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const { switchChain } = useSwitchChain();

	const position = useVaultUserPosition(vault);
	const wrongChain = isConnected && chainId !== bsc.id;
	const principal = position.deposited;

	const bonusShare = useMemo(
		() => computeBonusShare(principal, totalDeposited, bonusPool),
		[bonusPool, principal, totalDeposited],
	);

	const refundAmount = principal + bonusShare;

	const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
	const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: bsc.id });
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (receipt.isSuccess) {
			onUserStateChanged?.();
			void position.refetch();
		}
	}, [receipt.isSuccess, onUserStateChanged, position]);

	const isLocked = isPending || receipt.isLoading;
	const noDeposit = principal === 0n;
	// After success the indexer eventually drops the user's deposit to 0;
	// in the meantime treat success as terminal so we don't allow a re-click.
	const isRefunded = receipt.isSuccess || (submitted && noDeposit);

	function onRefund() {
		if (!vault || !address || noDeposit || wrongChain) return;
		setSubmitted(true);
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "refund",
			chainId: bsc.id,
		});
	}

	function reset_() {
		reset();
		setSubmitted(false);
	}

	return (
		<Card
			className={cn(
				"border-red-400/20 bg-[#08080a] py-0",
				sticky === "top" && "sticky top-6",
				sticky === "bottom" &&
					"fixed bottom-0 left-0 right-0 z-30 border-t border-l-0 border-r-0 border-b-0 md:static md:border-l md:border-r md:border-t md:border-b",
				className,
			)}
			data-testid="refund-widget"
		>
			<CardHeader className="border-b border-red-400/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">claim refund</CardTitle>
				<p className="text-xs text-zinc-500">
					this launch did not bundle. pull your principal plus your share of the bonus pool.
				</p>
			</CardHeader>
			<CardContent className="space-y-5 px-6 py-6">
				{!isConnected ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">connect a wallet to claim your refund.</p>
						<LinkedEoaCTA className="bg-red-400/90 text-black hover:bg-red-400 transition-colors">
							connect wallet
						</LinkedEoaCTA>
					</div>
				) : wrongChain ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">switch to bsc to claim.</p>
						<Button
							type="button"
							onClick={() => switchChain({ chainId: bsc.id })}
							className="bg-red-400/90 text-black hover:bg-red-400 transition-colors"
						>
							switch network
						</Button>
					</div>
				) : !vault ? (
					<p className="text-sm text-zinc-400">vault address not ready yet. give it a moment.</p>
				) : isRefunded ? (
					<RefundSuccess txHash={txHash ?? null} onReset={reset_} />
				) : (
					<>
						<div className="space-y-2 text-sm">
							<Row label="your deposit" value={`${formatEther(principal).slice(0, 10)} bnb`} />
							<Row label="bonus share" value={`${formatEther(bonusShare).slice(0, 10)} bnb`} />
							<div className="border-t border-white/5 pt-3">
								<Row label="total refund" value={`${formatEther(refundAmount).slice(0, 10)} bnb`} emphasize />
							</div>
						</div>

						{writeError ? (
							<p className="text-xs text-red-400" role="alert" data-testid="refund-error">
								{normalizeRefundError(writeError)}
							</p>
						) : null}

						<Button
							type="button"
							onClick={onRefund}
							disabled={isLocked || noDeposit}
							aria-disabled={isLocked || noDeposit}
							aria-label={
								noDeposit
									? "no refund available, you have no deposit on this vault"
									: `refund ${formatEther(refundAmount).slice(0, 10)} bnb`
							}
							className="w-full bg-red-400/90 text-black hover:bg-red-400 transition-colors disabled:opacity-40"
							data-testid="refund-button"
						>
							{isPending ? (
								<>
									<Loader2 className="size-4 animate-spin" /> sign in wallet
								</>
							) : receipt.isLoading ? (
								<>
									<Loader2 className="size-4 animate-spin" /> confirming
								</>
							) : noDeposit ? (
								"no refund available"
							) : (
								`refund ${formatEther(refundAmount).slice(0, 10)} bnb`
							)}
						</Button>

						<p className="text-[11px] text-zinc-500 leading-relaxed">
							idempotent on-chain. a second call from the same address reverts. there is no deadline for refunds.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
	return (
		<div className="flex justify-between">
			<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{label}</span>
			<span className={cn("tabular-nums", emphasize ? "text-red-200 font-medium" : "text-zinc-100")}>{value}</span>
		</div>
	);
}

function RefundSuccess({ txHash, onReset }: { txHash: string | null; onReset: () => void }) {
	return (
		<div className="flex flex-col gap-3" data-testid="refund-success">
			<div className="border border-[#00ff87]/30 bg-[#00ff87]/[0.05] px-3 py-3 text-sm text-[#d6ffe9]">
				<p className="font-medium">refunded.</p>
				<p className="text-xs text-zinc-300/90 mt-1">principal + bonus share returned to your wallet.</p>
			</div>
			{txHash ? (
				<a
					href={`https://bscscan.com/tx/${txHash}`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 underline-offset-2 hover:underline"
					data-testid="refund-tx-link"
				>
					view tx on bscscan
					<ExternalLink className="size-3" aria-hidden />
				</a>
			) : null}
			<Button
				type="button"
				variant="outline"
				onClick={onReset}
				className="border-white/10 text-zinc-400 hover:bg-white/5"
			>
				dismiss
			</Button>
		</div>
	);
}
