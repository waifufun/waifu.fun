"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
	useAccount,
	useChainId,
	useReadContract,
	useSwitchChain,
	useWaitForTransactionReceipt,
	useWriteContract,
} from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LaunchTier, launchVaultAbi } from "@/lib/launch-vault/abi";

type Props = {
	vault: Address | undefined;
	/** Raw vault state byte: 0 OPEN, 1 CLOSED, 2 LAUNCHED, 3 REFUND. */
	state: number | null;
	onUserStateChanged?: () => void;
};

/**
 * Admin "Instant Admin Refund (TEST only)" button.
 *
 * Only renders when:
 *   - tier == TIER_TEST (read from the on-chain vault)
 *   - state is OPEN or CLOSED (not LAUNCHED, not REFUND already)
 *   - the connected wallet is the LaunchFactory owner (read from
 *     vault.factory() then factory.owner())
 *
 * On click, calls `vault.instantAdminRefund("admin-refund-test")`. The chain
 * enforces all the real gates (factory-owner-only, tier check, state check)
 * so the UI visibility is a UX hint, not a security boundary.
 *
 * Security model: real-money tiers (80/90/95/98) retain the 24h-delayed
 * `scheduleAdminRefund` + `adminEnableRefund` path. TIER_TEST is the only
 * tier with an instant-refund path because it is an explicit smoke-test
 * tier whose depositors are on notice that the launch is recoverable.
 */
export function AdminInstantRefundWidget({ vault, state, onUserStateChanged }: Props) {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const { switchChain } = useSwitchChain();

	// Read tier off the vault. Returns uint8; cast to LaunchTier value.
	const tierQuery = useReadContract({
		address: vault,
		abi: launchVaultAbi,
		functionName: "tier",
		chainId: bsc.id,
		query: { enabled: Boolean(vault) },
	});
	const tier = tierQuery.data === undefined ? null : Number(tierQuery.data);

	// Read factory address off the vault, then owner off the factory.
	const factoryQuery = useReadContract({
		address: vault,
		abi: launchVaultAbi,
		functionName: "factory",
		chainId: bsc.id,
		query: { enabled: Boolean(vault) },
	});
	const factoryAddress = factoryQuery.data as Address | undefined;

	const ownerAbi = useMemo(
		() =>
			[
				{
					type: "function",
					stateMutability: "view",
					name: "owner",
					inputs: [],
					outputs: [{ name: "", type: "address" }],
				},
			] as const,
		[],
	);
	const ownerQuery = useReadContract({
		address: factoryAddress,
		abi: ownerAbi,
		functionName: "owner",
		chainId: bsc.id,
		query: { enabled: Boolean(factoryAddress) },
	});
	const factoryOwner = ownerQuery.data as Address | undefined;

	const isFactoryOwner = Boolean(address && factoryOwner && address.toLowerCase() === factoryOwner.toLowerCase());

	const isTestTier = tier === LaunchTier.TIER_TEST;
	const isPreLaunchState = state === 0 || state === 1; // OPEN or CLOSED
	const wrongChain = isConnected && chainId !== bsc.id;

	const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
	const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: bsc.id });
	const [confirmed, setConfirmed] = useState(false);

	useEffect(() => {
		if (receipt.isSuccess) {
			onUserStateChanged?.();
		}
	}, [receipt.isSuccess, onUserStateChanged]);

	// Bail early on visibility checks. Only render if all gates pass.
	if (!vault) return null;
	if (!isTestTier) return null;
	if (!isPreLaunchState) return null;
	if (!isConnected) return null;
	if (!isFactoryOwner) return null;

	const isLocked = isPending || receipt.isLoading;
	const done = receipt.isSuccess;

	function onClick() {
		if (!vault) return;
		if (wrongChain) {
			switchChain?.({ chainId: bsc.id });
			return;
		}
		if (!confirmed) {
			const ok = window.confirm(
				"this irreversibly flips the vault into REFUND state. depositors will pull their BNB. continue?",
			);
			if (!ok) return;
			setConfirmed(true);
		}
		reset();
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "instantAdminRefund",
			args: ["admin-refund-test"],
			chainId: bsc.id,
		});
	}

	const errMsg = writeError?.message ?? receipt.error?.message ?? null;

	return (
		<Card className="border-red-500/30 bg-red-500/[0.04]">
			<CardHeader>
				<CardTitle className="text-sm font-mono uppercase tracking-wider text-red-300">
					admin · instant refund (TEST only)
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="text-xs text-neutral-400 leading-relaxed">
					TIER_TEST smoke-test vault. factory owner can flip into REFUND state instantly, bypassing the 24h delay.
					real-money tiers retain the 24h-delayed admin refund for sniper safety.
				</p>
				<Button type="button" variant="destructive" disabled={isLocked || done} onClick={onClick} className="w-full">
					{isLocked ? (
						<>
							<Loader2 className="mr-2 size-4 animate-spin" />
							refunding...
						</>
					) : done ? (
						"refund triggered"
					) : wrongChain ? (
						"switch to BSC"
					) : (
						"instant admin refund (TEST only)"
					)}
				</Button>
				{errMsg ? <p className="text-[10px] font-mono text-red-300 break-all">{errMsg}</p> : null}
			</CardContent>
		</Card>
	);
}
