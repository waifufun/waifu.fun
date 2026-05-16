"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { LinkedEoaCTA } from "@/components/auth/linked-eoa-cta";
import { Button } from "@/components/ui/button";
import { useClaimState } from "@/hooks/use-post-launch";
import { launchVaultAbi } from "@/lib/launch-vault/abi";

import { formatTokenAmount, vestingProgress } from "./__lib/format";

type Props = {
	vault: Address | undefined;
	ticker: string;
	vestingEnabled: boolean;
	launchTimestamp: number | null;
};

const TOKEN_DECIMALS = 18;
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

	// claim state machine, surfaced as a one-line caption above the cta so
	// the user knows exactly where they sit: nothing yet / partial / done.
	const fullyClaimed = !noPosition && allocation > 0n && claimed >= allocation;
	const partiallyClaimed = !noPosition && claimed > 0n && !fullyClaimed;
	const nothingClaimedYet = !noPosition && claimed === 0n;
	const stateCaption = fullyClaimed
		? "fully claimed"
		: partiallyClaimed
			? "partially claimed"
			: nothingClaimedYet
				? "nothing claimed yet"
				: null;

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
			<div className="flex items-baseline justify-between mb-4">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">claim</div>
				{stateCaption ? (
					<div
						className={`text-[10px] font-mono uppercase tracking-[0.18em] ${
							fullyClaimed ? "text-[#00ff87]" : partiallyClaimed ? "text-amber-300" : "text-white/40"
						}`}
						aria-label={`claim state: ${stateCaption}`}
					>
						{stateCaption}
					</div>
				) : null}
			</div>

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

					{txHash ? (
						<div className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em]">
							<a
								href={`https://bscscan.com/tx/${txHash}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-white/55 hover:text-[#00ff87] transition-colors"
								aria-label="view last claim transaction on bscscan"
							>
								last claim tx <ExternalLink className="w-3 h-3" aria-hidden="true" />
							</a>
						</div>
					) : null}

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
	return (
		<section className="border border-white/10 bg-[#08080a] rounded-sm p-5" aria-label="claim widget">
			{children}
		</section>
	);
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

	const { pct, remainingSecs } = vestingProgress(launchTimestamp, Math.floor(Date.now() / 1000));
	if (remainingSecs <= 0) return <span>fully vested.</span>;

	const hrs = Math.floor(remainingSecs / 3600);
	const mins = Math.floor((remainingSecs % 3600) / 60);
	return (
		<span>
			vesting <span className="tabular-nums text-white/75">{pct.toFixed(1)}%</span> · fully unlocks in{" "}
			<span className="tabular-nums text-white/75">
				{hrs}h {mins}m
			</span>
		</span>
	);
}

function formatTokens(value: bigint): string {
	return formatTokenAmount(value, TOKEN_DECIMALS, 4);
}
