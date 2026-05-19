"use client";

import { Users } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { PublicLaunchExtended } from "@/lib/launch-vault/api";
import {
	deriveLaunchDisplayState,
	displayStateHeadline,
	displayStateLabel,
	displayStateTone,
} from "@/lib/launch-vault/launch-display-state";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import { bscscanTokenUrl, flapTokenUrl, formatVanityAddress, pancakeSwapUrl } from "@/lib/launch-vault/vanity-address";
import { cn } from "@/lib/utils";

import { LaunchCountdown } from "./launch-countdown";
import { PresaleProgress } from "./presale-progress";

/**
 * Internal trade URL on waifu.fun. BSC tokens land on `/agent/[address]`
 * via the `/token/bsc/56/...` layout redirect (see
 * `apps/frontend/src/app/token/[chain]/[chainId]/[contractAddress]/layout.tsx`),
 * so we route straight there to skip the round-trip.
 */
function tradeOnWaifuUrl(tokenAddress: string | null | undefined): string | null {
	if (typeof tokenAddress !== "string") return null;
	if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) return null;
	return `/agent/${tokenAddress}`;
}

type Props = {
	meta: PublicLaunchExtended | null;
	tier: LaunchTierInfo;
	totalDeposited: bigint;
	depositorCount: bigint;
	closeTimestamp: bigint | null;
	state: number | null;
	bonusPool?: bigint | null;
};

const TONE_BADGE_CLASS: Record<ReturnType<typeof displayStateTone>, string> = {
	accent: "border-[#00ff87]/40 text-[#00ff87] bg-[#00ff87]/[0.05]",
	warn: "border-yellow-400/40 text-yellow-300 bg-yellow-400/5",
	info: "border-blue-400/40 text-blue-300 bg-blue-400/5",
	danger: "border-red-400/40 text-red-300 bg-red-400/5",
};

const TONE_DOT_CLASS: Record<ReturnType<typeof displayStateTone>, string> = {
	accent: "bg-[#00ff87] animate-pulse",
	warn: "bg-yellow-300",
	info: "bg-blue-300",
	danger: "bg-red-300",
};

export function LaunchHero({ meta, tier, totalDeposited, depositorCount, closeTimestamp, state, bonusPool }: Props) {
	const name = meta?.tokenName ?? "agent launch";
	const symbol = meta?.tokenTicker ?? "–";
	const image = meta?.tokenImageUrl ?? null;

	// Map on-chain + off-chain inputs to the wave H display state machine.
	// Backend `status` field is informational only. Vault state is the
	// authoritative source for OPEN/CLOSED/LAUNCHED.
	const displayState = deriveLaunchDisplayState({
		vaultState: state,
		backendStatus: meta?.status ?? null,
		closeTimestamp: closeTimestamp ?? null,
		tokenAddress: meta?.tokenAddress ?? null,
	});
	const tone = displayStateTone(displayState);
	const stateBadgeClass = TONE_BADGE_CLASS[tone];
	const dotClass = TONE_DOT_CLASS[tone];
	const stateLabel = displayStateLabel(displayState);
	const headline = displayStateHeadline(displayState);

	// Predicted (vanity) address surfaces from the day the launch row is
	// created. Real tokenAddress lands when the bundle confirms; we prefer
	// it once known.
	const tokenAddress = meta?.tokenAddress ?? null;
	const predictedAddress = meta?.predictedTokenAddress ?? null;
	const displayAddress = tokenAddress ?? predictedAddress;
	const showVanity = displayState !== "presale" && displayState !== "created";
	const bscscan = bscscanTokenUrl(tokenAddress);
	const flap = flapTokenUrl(tokenAddress);
	const pcs = pancakeSwapUrl(tokenAddress);

	const capWei = meta?.presaleCapWei ? BigInt(meta.presaleCapWei) : capFromBnb(tier.presaleCapBnb);

	const countdownLabel =
		displayState === "presale"
			? "closes in"
			: displayState === "closed"
				? "awaiting bundle"
				: displayState === "bundling"
					? "bundling now"
					: displayState === "launched"
						? "live on dex"
						: displayState === "refunding"
							? "refunds open"
							: "status";

	return (
		<section className="border border-white/10 bg-[#08080a] p-5 md:p-8">
			<div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
				<div className="flex items-start gap-3 md:gap-4 min-w-0">
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={image}
							alt={`${name} logo`}
							className="size-14 shrink-0 rounded-sm border border-white/10 object-cover md:size-20"
						/>
					) : (
						<div className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-[#111114] text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 md:size-20">
							no logo
						</div>
					)}
					<div className="flex flex-col gap-2 min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-xl font-semibold text-zinc-100 md:text-3xl truncate">{name}</h1>
							<span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 md:text-sm">${symbol}</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-[0.2em]",
									stateBadgeClass,
								)}
								data-testid="launch-state-badge"
							>
								<span className={cn("w-1 h-1 rounded-full", dotClass)} />
								{stateLabel}
							</span>
							<Badge variant="default">{tier.label}</Badge>
							<span className="flex items-center gap-1 text-xs text-zinc-400">
								<Users className="size-3" /> {depositorCount.toString()} backer{depositorCount === 1n ? "" : "s"}
							</span>
						</div>
						<p className="text-[11px] text-zinc-500 leading-relaxed max-w-[52ch]" data-testid="launch-state-headline">
							{headline}
						</p>
						{showVanity ? (
							<div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono">
								<span className="text-zinc-500">token:</span>
								<span className="tabular-nums text-zinc-200" data-testid="launch-token-address">
									{formatVanityAddress(displayAddress)}
								</span>
								{displayState === "bundling" && !tokenAddress ? (
									<span className="text-zinc-500 italic">mining…</span>
								) : null}
								{tokenAddress ? (
									<span className="flex items-center gap-2 text-[#00ff87]">
										{tradeOnWaifuUrl(tokenAddress) ? (
											<Link
												href={tradeOnWaifuUrl(tokenAddress) as string}
												className="hover:opacity-80 underline-offset-2 hover:underline"
												data-testid="launch-hero-trade-link"
											>
												trade on waifu →
											</Link>
										) : null}
										{bscscan ? (
											<a href={bscscan} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
												bscscan ↗
											</a>
										) : null}
										{flap ? (
											<a href={flap} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
												flap ↗
											</a>
										) : null}
										{pcs ? (
											<a href={pcs} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
												pcs v2 ↗
											</a>
										) : null}
									</span>
								) : null}
							</div>
						) : null}
					</div>
				</div>

				<div className="flex flex-col items-start md:items-end shrink-0">
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{countdownLabel}</span>
					<LaunchCountdown closeTimestampSec={closeTimestamp} className="mt-1 flex items-baseline gap-2" />
				</div>
			</div>

			<div className="mt-8">
				<PresaleProgress totalDeposited={totalDeposited} capWei={capWei} bonusPool={bonusPool ?? null} />
			</div>
		</section>
	);
}

function capFromBnb(bnb: number): bigint {
	return BigInt(Math.floor(bnb * 1e6)) * 10n ** 12n;
}
