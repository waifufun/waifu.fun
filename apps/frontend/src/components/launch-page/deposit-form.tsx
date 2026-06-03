"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";
import { useBalance, useEstimateFeesPerGas, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { launchVaultAbi } from "@/lib/launch-vault/abi";
import { normalizeTxError } from "@/lib/tx-error";

type Props = {
	vault: Address;
	address: Address;
	disabled?: boolean;
	disabledReason?: string | undefined;
	onCompleted?: (() => void) | undefined;
	/** Cap minus totalDeposited in wei, used for "max-to-cap" preset and projection. */
	remainingToCapWei?: bigint;
	/** Total presale tokens to project allocation. */
	presaleTokens?: bigint | null;
	/** Current totalDeposited for pro-rata projection. */
	totalDepositedWei?: bigint;
	tokenSymbol?: string | null;
};

// Quick-amount presets in BNB. "max-to-cap" handled separately.
const QUICK_AMOUNTS_BNB = [0.1, 0.5, 1, 5];
const DEPOSIT_GAS_ESTIMATE = 100_000n; // conservative LaunchVault.deposit() ceiling
const GAS_BUFFER_WEI = parseEther("0.005"); // hard floor used as fallback

export function DepositForm({
	vault,
	address,
	disabled,
	disabledReason,
	onCompleted,
	remainingToCapWei,
	presaleTokens,
	totalDepositedWei,
	tokenSymbol,
}: Props) {
	const balance = useBalance({ address, chainId: bsc.id });
	const fees = useEstimateFeesPerGas({ chainId: bsc.id });
	const [amountStr, setAmountStr] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Estimated gas cost in wei, falls back to a flat buffer if rpc is silent.
	const gasCostWei = useMemo(() => {
		const maxFee = fees.data?.maxFeePerGas ?? fees.data?.gasPrice ?? null;
		if (!maxFee || maxFee <= 0n) return GAS_BUFFER_WEI;
		return DEPOSIT_GAS_ESTIMATE * maxFee;
	}, [fees.data?.maxFeePerGas, fees.data?.gasPrice]);

	const max = useMemo(() => {
		const v = balance.data?.value ?? 0n;
		const headroom = gasCostWei > 0n ? gasCostWei : GAS_BUFFER_WEI;
		return v > headroom ? v - headroom : 0n;
	}, [balance.data?.value, gasCostWei]);

	// Cap-aware ceiling: the user can't deposit more than what's left in the cap.
	const remaining = remainingToCapWei ?? 0n;
	const ceiling = remaining > 0n && remaining < max ? remaining : max;

	const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
	const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: bsc.id });

	useEffect(() => {
		if (receipt.isSuccess) {
			setAmountStr("");
			setError(null);
			onCompleted?.();
			reset();
		}
	}, [receipt.isSuccess, onCompleted, reset]);

	// Surface wallet-rejection / write failure and on-chain revert, otherwise the
	// button silently returns to "deposit bnb" and the user can't tell a failed
	// BNB deposit from one still in flight.
	useEffect(() => {
		if (writeError) setError(normalizeTxError(writeError, "deposit failed. try again."));
		else if (receipt.isError) setError(normalizeTxError(receipt.error, "deposit reverted on-chain."));
	}, [writeError, receipt.isError, receipt.error]);

	const isLocked = disabled || isPending || receipt.isLoading;

	// Projected token allocation for the typed amount.
	// At close, allocation = (deposit / totalDeposited) * presaleTokens.
	// Pre-close we approximate using the live totalDeposited + the typed amount.
	const projectedTokens = useMemo(() => {
		try {
			if (!amountStr.trim()) return null;
			const typedWei = parseEther(amountStr.trim());
			if (typedWei <= 0n || !presaleTokens || presaleTokens === 0n) return null;
			const total = (totalDepositedWei ?? 0n) + typedWei;
			if (total === 0n) return null;
			return (typedWei * presaleTokens) / total;
		} catch {
			return null;
		}
	}, [amountStr, presaleTokens, totalDepositedWei]);

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
			setError("enter an amount.");
			return;
		}
		if (max > 0n && valueWei > max) {
			setError("not enough bnb. leave headroom for gas.");
			return;
		}
		if (remaining > 0n && valueWei > remaining) {
			setError("exceeds remaining cap. lower the amount.");
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

	function setFromBnb(bnb: number) {
		const wei = parseEther(bnb.toString());
		const capped = ceiling > 0n && wei > ceiling ? ceiling : wei;
		setAmountStr(formatBnbShort(capped));
	}

	function setMaxToCap() {
		if (ceiling <= 0n) return;
		setAmountStr(formatBnbShort(ceiling));
	}

	return (
		<form className="flex flex-col gap-3" onSubmit={onSubmit} aria-label="deposit bnb to presale">
			<label className="flex flex-col gap-2">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">amount (bnb)</span>
				<input
					type="text"
					inputMode="decimal"
					placeholder="0.0"
					value={amountStr}
					onChange={(e) => setAmountStr(sanitize(e.target.value))}
					disabled={isLocked}
					aria-label="deposit amount in bnb"
					className="border border-white/10 bg-[#0b0b0d] px-3 py-2 font-mono text-lg text-zinc-100 outline-none transition-colors duration-150 focus:border-[#00ff87]/40 focus:bg-[#0c0c0e] disabled:opacity-50"
				/>
			</label>
			<div className="flex flex-wrap gap-2">
				{QUICK_AMOUNTS_BNB.map((bnb) => (
					<button
						key={bnb}
						type="button"
						disabled={isLocked || max === 0n}
						onClick={() => setFromBnb(bnb)}
						aria-label={`set deposit to ${bnb} bnb`}
						className="border border-white/10 bg-[#0b0b0d] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-[#00ff87]/40 hover:text-zinc-100 disabled:opacity-40"
					>
						{bnb}
					</button>
				))}
				<button
					type="button"
					disabled={isLocked || ceiling === 0n}
					onClick={setMaxToCap}
					aria-label="set deposit to max remaining cap"
					className="border border-[#00ff87]/20 bg-[#0b0b0d] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[#00ff87]/90 transition-colors hover:border-[#00ff87]/50 hover:text-[#00ff87] disabled:opacity-40"
				>
					max
				</button>
			</div>

			<div className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
				<div className="flex justify-between">
					<span>balance</span>
					<span className="tabular-nums text-zinc-300">
						{balance.data ? `${formatEther(balance.data.value).slice(0, 8)} bnb` : "–"}
					</span>
				</div>
				<div className="flex justify-between">
					<span>est. gas</span>
					<span className="tabular-nums text-zinc-300" data-testid="deposit-gas-estimate">
						{formatGas(gasCostWei)} bnb
					</span>
				</div>
				{projectedTokens !== null ? (
					<div className="flex justify-between">
						<span>you&apos;ll get</span>
						<span className="tabular-nums text-[#00ff87]" data-testid="deposit-projected-tokens">
							~{formatTokenAmount(projectedTokens)} {tokenSymbol ?? "tokens"}
						</span>
					</div>
				) : null}
			</div>

			{error ? (
				<p className="text-xs text-red-400" role="alert">
					{error}
				</p>
			) : null}
			{disabled && disabledReason ? <p className="text-xs text-zinc-500">{disabledReason}</p> : null}

			<Button
				type="submit"
				disabled={isLocked || max === 0n}
				className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90 transition-colors"
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

function formatBnbShort(wei: bigint): string {
	const ether = formatEther(wei);
	const num = Number(ether);
	if (!Number.isFinite(num)) return ether;
	return num.toFixed(4);
}

function formatGas(wei: bigint): string {
	const num = Number(formatEther(wei));
	if (!Number.isFinite(num) || num <= 0) return "n/a";
	if (num < 0.0001) return "<0.0001";
	return num.toFixed(5);
}

function formatTokenAmount(value: bigint): string {
	if (value <= 0n) return "0";
	const ETHER = 10n ** 18n;
	const whole = value / ETHER;
	if (whole >= 1_000_000n) return `${(Number(whole / 1_000n) / 1_000).toFixed(2)}m`;
	if (whole >= 1_000n) return `${(Number(whole) / 1_000).toFixed(2)}k`;
	if (whole > 0n) return whole.toString();
	const small = Number(formatEther(value));
	return small.toFixed(4);
}
