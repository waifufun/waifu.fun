"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { launchVaultAbi } from "@/lib/launch-vault/abi";

type Props = {
	vault: Address;
	deposited: bigint;
	penaltyBps: bigint | null;
	disabled?: boolean;
	onCompleted?: () => void;
};

export function WithdrawForm({ vault, deposited, penaltyBps, disabled, onCompleted }: Props) {
	const [amountStr, setAmountStr] = useState("");
	const [error, setError] = useState<string | null>(null);

	const penaltyPct = penaltyBps !== null ? Number(penaltyBps) / 100 : 5;

	const { writeContract, data: txHash, isPending, reset } = useWriteContract();
	const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: bsc.id });

	useEffect(() => {
		if (receipt.isSuccess) {
			setAmountStr("");
			setError(null);
			onCompleted?.();
			reset();
		}
	}, [receipt.isSuccess, onCompleted, reset]);

	const isLocked = disabled || isPending || receipt.isLoading;

	const requestedWei = useMemo(() => {
		const trimmed = amountStr.trim();
		if (!trimmed) return 0n;
		try {
			return parseEther(trimmed);
		} catch {
			return -1n;
		}
	}, [amountStr]);

	const refundWei = requestedWei > 0n && penaltyBps !== null ? (requestedWei * (10_000n - penaltyBps)) / 10_000n : 0n;
	const penaltyWei = requestedWei > 0n ? requestedWei - refundWei : 0n;

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (requestedWei <= 0n) {
			setError("enter an amount.");
			return;
		}
		if (requestedWei > deposited) {
			setError("more than you deposited.");
			return;
		}
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "withdraw",
			args: [requestedWei],
			chainId: bsc.id,
		});
	}

	function onWithdrawAll() {
		setError(null);
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "withdrawAll",
			chainId: bsc.id,
		});
	}

	return (
		<form className="flex flex-col gap-3" onSubmit={onSubmit}>
			<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
				<span>your deposit</span>
				<span className="tabular-nums text-zinc-300">{formatEther(deposited).slice(0, 8)} bnb</span>
			</div>
			<label className="flex flex-col gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">withdraw amount</span>
				<input
					type="text"
					inputMode="decimal"
					placeholder="0.0"
					value={amountStr}
					onChange={(e) => setAmountStr(sanitize(e.target.value))}
					disabled={isLocked}
					className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-lg text-zinc-100 outline-none transition-colors duration-150 focus:border-orange-300/40 disabled:opacity-50"
				/>
			</label>

			{requestedWei > 0n ? (
				<div className="border border-orange-400/20 bg-orange-400/5 px-3 py-2 text-xs text-orange-200">
					<div className="flex justify-between">
						<span>refund</span>
						<span className="tabular-nums">{formatEther(refundWei).slice(0, 10)} bnb</span>
					</div>
					<div className="flex justify-between">
						<span>{penaltyPct}% penalty</span>
						<span className="tabular-nums">{formatEther(penaltyWei).slice(0, 10)} bnb</span>
					</div>
				</div>
			) : (
				<p className="text-xs text-zinc-500">
					withdrawing during the open window forfeits {penaltyPct}% to the bonus pool. it gets added to the bundle at
					launch.
				</p>
			)}

			{error ? <p className="text-xs text-red-400">{error}</p> : null}

			<div className="flex flex-col gap-2 sm:flex-row">
				<Button
					type="submit"
					disabled={isLocked || requestedWei <= 0n}
					variant="outline"
					className="flex-1 border-orange-400/40 text-orange-200 hover:bg-orange-400/10 hover:text-orange-100"
				>
					{isPending ? (
						<>
							<Loader2 className="size-4 animate-spin" /> sign in wallet
						</>
					) : receipt.isLoading ? (
						<>
							<Loader2 className="size-4 animate-spin" /> confirming
						</>
					) : (
						`withdraw (−${penaltyPct}%)`
					)}
				</Button>
				<Button
					type="button"
					onClick={onWithdrawAll}
					disabled={isLocked || deposited === 0n}
					variant="outline"
					className="flex-1 border-white/10 text-zinc-300 hover:bg-white/5"
				>
					withdraw all
				</Button>
			</div>
		</form>
	);
}

function sanitize(value: string): string {
	const cleaned = value.replace(/[^0-9.]/g, "");
	const parts = cleaned.split(".");
	if (parts.length <= 2) return cleaned;
	return `${parts[0]}.${parts.slice(1).join("")}`;
}
