"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { type Address, formatUnits } from "viem";
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { Button } from "@/components/ui/button";
import { useClaimState } from "@/hooks/use-post-launch";
import { launchVaultAbi } from "@/lib/launch-vault/abi";

type Props = {
	vault: Address | undefined;
	ticker: string;
	vestingEnabled: boolean;
	launchTimestamp: number | null;
};

const TOKEN_DECIMALS = 18;
const VESTING_TGE_BPS = 5000n;
const VESTING_BPS_DENOM = 10000n;
const VESTING_WINDOW_SECS = 24 * 60 * 60; // 24h linear

/**
 * Claim widget for v3 launches that have entered LAUNCHED state.
 *
 * Vesting policy mirrors `LaunchVault._vestedPct()`:
 *   - if !vestingEnabled \u2192 100% claimable at TGE
 *   - else \u2192 50% at TGE, then linear to 100% over 24h
 *
 * The on-chain `claimableOf(user)` view is the source of truth for the
 * "claim now" amount; we derive locked/vested using the same constants
 * to render the timeline copy.
 */
export function ClaimWidget({ vault, ticker, vestingEnabled, launchTimestamp }: Props) {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const { switchChain } = useSwitchChain();

	const claim = useClaimState(vault);

	const { writeContract, data: txHash, isPending, reset } = useWriteContract();
	const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: bsc.id });

	useEffect(() => {
		if (receipt.isSuccess) {
			void claim.refetch();
			reset();
		}
	}, [receipt.isSuccess, claim, reset]);

	if (!vault) {
		return <Card>vault not deployed</Card>;
	}

	if (!isConnected) {
		return (
			<Card>
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-3">claim</div>
				<LinkedEoaCTA>connect to claim your allocation</LinkedEoaCTA>
			</Card>
		);
	}

	const wrongChain = chainId !== bsc.id;
	const allocation = claim.data?.allocation ?? 0n;
	const claimable = claim.data?.claimable ?? 0n;
	const vested = claim.data?.vested ?? 0n;
	const claimed = claim.data?.claimed ?? 0n;
	const deposited = claim.data?.deposited ?? 0n;
	const locked = allocation > vested ? allocation - vested : 0n;

	const isLocked = isPending || receipt.isLoading;
	const canClaim = !wrongChain && claimable > 0n;
	const noPosition = deposited === 0n;

	function onClaim() {
		if (!vault) return;
		writeContract({
			address: vault,
			abi: launchVaultAbi,
			functionName: "claim",
			chainId: bsc.id,
		});
	}

	return (
		<Card>
			<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-4">claim</div>

			{noPosition ? (
				<div className="text-[12px] font-mono text-white/55">no presale position for this address.</div>
			) : (
				<>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
						<Stat label="allocation" value={`${formatTokens(allocation)} ${ticker}`} />
						<Stat label="claimable now" value={`${formatTokens(claimable)} ${ticker}`} accent={canClaim} />
						<Stat label="vested" value={`${formatTokens(vested)} ${ticker}`} />
						<Stat label="locked" value={`${formatTokens(locked)} ${ticker}`} />
						<Stat label="already claimed" value={`${formatTokens(claimed)} ${ticker}`} fullWidth />
					</dl>

					<div className="mt-5 text-[11px] font-mono text-white/45">
						{vestingEnabled ? (
							<VestingCopy launchTimestamp={launchTimestamp} />
						) : (
							<span>no vesting. 100% claimable at tge.</span>
						)}
					</div>

					<div className="mt-5">
						{wrongChain ? (
							<Button
								onClick={() => switchChain({ chainId: bsc.id })}
								className="w-full bg-amber-400 text-black hover:bg-amber-300"
							>
								switch to bnb chain
							</Button>
						) : (
							<Button
								onClick={onClaim}
								disabled={!canClaim || isLocked}
								className="w-full bg-[#00ff87] text-black hover:bg-[#00ff87]/85 disabled:bg-white/10 disabled:text-white/40"
							>
								{isLocked ? (
									<span className="inline-flex items-center gap-2">
										<Loader2 className="w-4 h-4 animate-spin" />
										{receipt.isLoading ? "confirming\u2026" : "submitting\u2026"}
									</span>
								) : claimable > 0n ? (
									`claim ${formatTokens(claimable)} ${ticker}`
								) : (
									"nothing to claim"
								)}
							</Button>
						)}
					</div>
				</>
			)}
		</Card>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return <div className="border border-white/10 bg-[#08080a] rounded-sm p-5">{children}</div>;
}

function Stat({
	label,
	value,
	accent,
	fullWidth,
}: {
	label: string;
	value: string;
	accent?: boolean;
	fullWidth?: boolean;
}) {
	return (
		<div className={fullWidth ? "col-span-2" : undefined}>
			<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{label}</dt>
			<dd className={`mt-1 tabular-nums ${accent ? "text-[#00ff87]" : "text-white/85"}`}>{value}</dd>
		</div>
	);
}

function VestingCopy({ launchTimestamp }: { launchTimestamp: number | null }) {
	if (!launchTimestamp) return <span>50% at tge, 50% linear over 24h.</span>;

	const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - launchTimestamp);
	const remaining = VESTING_WINDOW_SECS - elapsed;
	if (remaining <= 0) return <span>fully vested.</span>;

	const pct =
		Number(VESTING_TGE_BPS + (BigInt(elapsed) * (VESTING_BPS_DENOM - VESTING_TGE_BPS)) / BigInt(VESTING_WINDOW_SECS)) /
		100;
	const hrs = Math.floor(remaining / 3600);
	const mins = Math.floor((remaining % 3600) / 60);
	return (
		<span>
			vesting <span className="tabular-nums text-white/75">{pct.toFixed(1)}%</span> \u00b7 fully unlocks in{" "}
			<span className="tabular-nums text-white/75">
				{hrs}h {mins}m
			</span>
		</span>
	);
}

function formatTokens(value: bigint): string {
	const whole = formatUnits(value, TOKEN_DECIMALS);
	const [intPart, fracPart] = whole.split(".");
	const grouped = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	if (!fracPart || /^0+$/.test(fracPart)) return grouped;
	return `${grouped}.${fracPart.slice(0, 4)}`;
}
