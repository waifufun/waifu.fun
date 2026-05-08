"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo } from "react";
import { type Address, formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVaultUserPosition } from "@/hooks/use-launch-vault";
import { VaultState } from "@/lib/launch-vault/abi";

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
	onUserStateChanged?: () => void;
};

export function DepositWidget({
	vault,
	state,
	totalDeposited,
	capWei,
	penaltyBps,
	presaleTokens,
	tokenSymbol,
	onUserStateChanged,
}: Props) {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const { switchChain } = useSwitchChain();

	const position = useVaultUserPosition(vault);
	const wrongChain = isConnected && chainId !== bsc.id;
	const roundOpen = state === VaultState.OPEN;
	const capHit = capWei > 0n && totalDeposited >= capWei;

	const projectedTokens = useMemo(() => {
		if (!presaleTokens || presaleTokens === 0n) return 0n;
		if (!position.deposited || position.deposited === 0n) return 0n;
		const denom = totalDeposited > 0n ? totalDeposited : 0n;
		if (denom === 0n) return 0n;
		return (position.deposited * presaleTokens) / denom;
	}, [presaleTokens, position.deposited, totalDeposited]);

	const allocation = position.allocation > 0n ? position.allocation : projectedTokens;

	return (
		<Card className="sticky top-6 border-white/10 bg-[#08080a] py-0">
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">join this round</CardTitle>
				<p className="text-xs text-zinc-500">deposit bnb during the 24h window. allocations are pro-rata at close.</p>
			</CardHeader>
			<CardContent className="space-y-5 px-6 py-6">
				{!isConnected ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">connect a wallet to deposit.</p>
						<ConnectButton.Custom>
							{({ openConnectModal, mounted }) => (
								<Button
									type="button"
									onClick={openConnectModal}
									disabled={!mounted}
									className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90"
								>
									connect wallet
								</Button>
							)}
						</ConnectButton.Custom>
					</div>
				) : wrongChain ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-zinc-300">switch to bsc mainnet to deposit.</p>
						<Button
							type="button"
							onClick={() => switchChain({ chainId: bsc.id })}
							className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90"
						>
							switch network
						</Button>
					</div>
				) : !vault ? (
					<p className="text-sm text-zinc-400">vault address not yet available for this launch.</p>
				) : (
					<>
						<DepositForm
							vault={vault}
							address={address as Address}
							disabled={!roundOpen || capHit}
							disabledReason={
								!roundOpen
									? "round is closed — deposits are locked"
									: capHit
										? "cap reached — try the withdraw window or check secondary"
										: undefined
							}
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
