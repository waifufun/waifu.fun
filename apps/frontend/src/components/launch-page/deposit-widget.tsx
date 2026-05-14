"use client";

import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { useMemo } from "react";
import { type Address, formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVaultUserPosition } from "@/hooks/use-launch-vault";
import { VaultState } from "@/lib/launch-vault/abi";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import { cn } from "@/lib/utils";

import { DepositForm } from "./deposit-form";
import { WithdrawForm } from "./withdraw-form";

type Props = {
	vault: Address | undefined;
	state: number | null;
	totalDeposited: bigint;
	capWei: bigint;
	penaltyBps: bigint | null;
	presaleTokens: bigint | null;
	tokenSymbol: string | null;
	tier: LaunchTierInfo;
	onUserStateChanged?: () => void;
	/** Mobile-only sticky positioning. Desktop sidebar uses sticky-top instead. */
	sticky?: "top" | "bottom";
	className?: string;
};

export function DepositWidget({
	vault,
	state,
	totalDeposited,
	capWei,
	penaltyBps,
	presaleTokens,
	tokenSymbol,
	tier,
	onUserStateChanged,
	sticky = "top",
	className,
}: Props) {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const { switchChain } = useSwitchChain();

	const position = useVaultUserPosition(vault);
	const wrongChain = isConnected && chainId !== bsc.id;
	const roundOpen = state === VaultState.OPEN;
	const capHit = capWei > 0n && totalDeposited >= capWei;
	const remainingToCap = capWei > totalDeposited ? capWei - totalDeposited : 0n;

	const projectedTokens = useMemo(() => {
		if (!presaleTokens || presaleTokens === 0n) return 0n;
		if (!position.deposited || position.deposited === 0n) return 0n;
		if (totalDeposited === 0n) return 0n;
		return (position.deposited * presaleTokens) / totalDeposited;
	}, [presaleTokens, position.deposited, totalDeposited]);

	const allocation = position.allocation > 0n ? position.allocation : projectedTokens;

	// Tier-specific subtitle copy + secondary CTA tooltip
	const graduates = tier.v2BuyBnb > 0;
	const subtitle = graduates
		? `deposit bnb during the 24h window. allocations are pro-rata at close. graduates to pcs v2 lp (${tier.v2BuyBnb} bnb v2 buy).`
		: "deposit bnb during the 24h window. allocations are pro-rata at close. seeds the pcs bonding curve directly.";

	return (
		<Card
			className={cn(
				"border-white/10 bg-[#08080a] py-0",
				sticky === "top" && "sticky top-6",
				sticky === "bottom" &&
					"fixed bottom-0 left-0 right-0 z-30 border-t border-l-0 border-r-0 border-b-0 md:static md:border-l md:border-r md:border-t md:border-b",
				className,
			)}
			data-testid="deposit-widget"
		>
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">join the round</CardTitle>
				<p className="text-xs text-zinc-500">{subtitle}</p>
			</CardHeader>
			<CardContent className="space-y-5 px-6 py-6">
				{!isConnected ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">connect a wallet to join.</p>
						<LinkedEoaCTA className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90 transition-colors">
							connect wallet
						</LinkedEoaCTA>
					</div>
				) : wrongChain ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">switch to bsc to join.</p>
						<Button
							type="button"
							onClick={() => switchChain({ chainId: bsc.id })}
							className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90 transition-colors"
						>
							switch network
						</Button>
					</div>
				) : !vault ? (
					<p className="text-sm text-zinc-400">vault address not ready yet. give it a moment.</p>
				) : (
					<>
						<DepositForm
							vault={vault}
							address={address as Address}
							disabled={!roundOpen || capHit}
							disabledReason={
								!roundOpen
									? "round closed. deposits locked."
									: capHit
										? "cap reached. catch it on the secondary market."
										: undefined
							}
							remainingToCapWei={remainingToCap}
							presaleTokens={presaleTokens}
							totalDepositedWei={totalDeposited}
							tokenSymbol={tokenSymbol}
							onCompleted={() => {
								void position.refetch();
								onUserStateChanged?.();
							}}
						/>

						{position.deposited > 0n ? (
							<div className="border-t border-white/5 pt-5">
								<div className="mb-3 flex flex-col gap-2 text-sm">
									<div className="flex justify-between">
										<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">your deposit</span>
										<span className="tabular-nums text-zinc-100">
											{formatEther(position.deposited).slice(0, 10)} bnb
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
											projected allocation
										</span>
										<span className="tabular-nums text-zinc-100">
											{formatTokenAmount(allocation)} {tokenSymbol ?? "tokens"}
										</span>
									</div>
								</div>
								{roundOpen ? (
									<WithdrawForm
										vault={vault}
										deposited={position.deposited}
										penaltyBps={penaltyBps}
										onCompleted={() => {
											void position.refetch();
											onUserStateChanged?.();
										}}
									/>
								) : (
									<p className="text-xs text-zinc-500">withdrawals are only allowed while the round is open.</p>
								)}
							</div>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function formatTokenAmount(value: bigint): string {
	if (value === 0n) return "0";
	const ETHER = 10n ** 18n;
	const whole = value / ETHER;
	if (whole >= 1_000_000n) {
		return `${(Number(whole / 1_000n) / 1_000).toFixed(2)}m`;
	}
	if (whole >= 1_000n) {
		return `${(Number(whole) / 1_000).toFixed(2)}k`;
	}
	if (whole > 0n) {
		return whole.toString();
	}
	const small = Number(value) / 1e18;
	return small.toFixed(4);
}
