"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";
import { useBalance, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { launchVaultAbi } from "@/lib/launch-vault/abi";

type Props = {
	vault: Address;
	address: Address;
	disabled?: boolean;
	disabledReason?: string | undefined;
	onCompleted?: (() => void) | undefined;
};

const PRESET_PCTS = [25, 50, 75, 100];
const GAS_BUFFER_WEI = parseEther("0.005"); // leave headroom for the deposit() tx itself

export function DepositForm({ vault, address, disabled, disabledReason, onCompleted }: Props) {
	const balance = useBalance({ address, chainId: bsc.id });
	const [amountStr, setAmountStr] = useState("");
	const [error, setError] = useState<string | null>(null);

	const max = useMemo(() => {
		const v = balance.data?.value ?? 0n;
		return v > GAS_BUFFER_WEI ? v - GAS_BUFFER_WEI : 0n;
	}, [balance.data?.value]);

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

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		let valueWei: bigint;
		try {
			valueWei = parseEther(amountStr.trim() || "0");
		} catch {
			setError("invalid amount");
			return;
		}
		if (valueWei <= 0n) {
			setError("amount must be greater than 0");
			return;
		}
		if (max > 0n && valueWei > max) {
			setError("not enough bnb (leave gas)");
			return;
		}
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "deposit",
			value: valueWei,
			chainId: bsc.id,
		});
	}

	return (
		<form className="flex flex-col gap-3" onSubmit={onSubmit}>
			<label className="flex flex-col gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">amount (bnb)</span>
				<input
					type="text"
					inputMode="decimal"
					placeholder="0.0"
					value={amountStr}
					onChange={(e) => setAmountStr(sanitize(e.target.value))}
					disabled={isLocked}
					className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-lg text-zinc-100 outline-none focus:border-[#00ff87]/40 disabled:opacity-50"
				/>
			</label>
			<div className="flex flex-wrap gap-2">
				{PRESET_PCTS.map((pct) => (
					<button
						key={pct}
						type="button"
						disabled={isLocked || max === 0n}
						onClick={() => setAmountStr(formatPreset(max, pct))}
						className="border border-white/10 bg-[#0b0b0d] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-[#00ff87]/40 hover:text-zinc-100 disabled:opacity-40"
					>
						{pct === 100 ? "max" : `${pct}%`}
					</button>
				))}
			</div>
			<div className="flex justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
				<span>balance</span>
				<span className="tabular-nums text-zinc-300">
					{balance.data ? `${formatEther(balance.data.value).slice(0, 8)} bnb` : "—"}
				</span>
			</div>

			{error ? <p className="text-xs text-red-400">{error}</p> : null}
			{disabled && disabledReason ? <p className="text-xs text-zinc-500">{disabledReason}</p> : null}

			<Button type="submit" disabled={isLocked || max === 0n} className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90">
				{isPending ? (
					<>
						<Loader2 className="size-4 animate-spin" /> awaiting wallet
					</>
				) : receipt.isLoading ? (
					<>
						<Loader2 className="size-4 animate-spin" /> confirming
					</>
				) : (
					"deposit bnb"
				)}
			</Button>
		</form>
	);
}

function sanitize(value: string): string {
	const cleaned = value.replace(/[^0-9.]/g, "");
	const parts = cleaned.split(".");
	if (parts.length <= 2) return cleaned;
	return `${parts[0]}.${parts.slice(1).join("")}`;
}

function formatPreset(max: bigint, pct: number): string {
	if (max === 0n) return "0";
	const fraction = (max * BigInt(pct)) / 100n;
	const ether = formatEther(fraction);
	const num = Number(ether);
	if (!Number.isFinite(num)) return ether;
	return num.toFixed(4);
}
