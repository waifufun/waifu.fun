/**
 * LaunchHeroV2: the launch-page hero, restyled to match AgentHomeV2.
 *
 * Visual language mirrors `components/agent-home/wave-t/hero.tsx`:
 *   - same THEME_TOKENS palette (accent #00ff87, bg-base #08080a,
 *     border-soft, text-tertiary, etc.)
 *   - same mono uppercase tracking labels
 *   - same identity block (portrait + name + ticker pills)
 *   - same hairline-divided cells
 *
 * Layout (1440px max-w):
 *   identity block       | cap progress block       | countdown + state
 *
 * Identity block:
 *   token image + name + ticker pill + tier pill + (depositor count)
 *
 * Cap progress block:
 *   "presale progress" label + big BNB number + thin bar
 *
 * Countdown block:
 *   "closes in" label + countdown timer + state pill
 *
 * Data inputs match the old LaunchHero so the call-site swap is a 1:1
 * prop replacement.
 */

"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { formatEther } from "viem";

import { Pulse, StatPill } from "@/components/agent-home/wave-t/_primitives";
import type { PublicLaunchExtended } from "@/lib/launch-vault/api";
import {
	deriveLaunchDisplayState,
	displayStateHeadline,
	displayStateLabel,
	displayStateTone,
} from "@/lib/launch-vault/launch-display-state";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import { bscscanTokenUrl, flapTokenUrl, formatVanityAddress, pancakeSwapUrl } from "@/lib/launch-vault/vanity-address";
import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";

import { LaunchCountdown } from "./launch-countdown";

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

const STATE_TONE_TO_PULSE: Record<ReturnType<typeof displayStateTone>, "accent" | "positive" | "negative"> = {
	accent: "accent",
	warn: "negative",
	info: "accent",
	danger: "negative",
};

const STATE_TONE_TO_PILL: Record<
	ReturnType<typeof displayStateTone>,
	"accent" | "neutral" | "negative" | "positive"
> = {
	accent: "accent",
	warn: "neutral",
	info: "accent",
	danger: "negative",
};

export function LaunchHeroV2({ meta, tier, totalDeposited, depositorCount, closeTimestamp, state, bonusPool }: Props) {
	const name = meta?.tokenName ?? "agent launch";
	const symbol = meta?.tokenTicker ?? "—";
	const image = resolveImageUrl(meta?.tokenImageUrl ?? null);

	const displayState = deriveLaunchDisplayState({
		vaultState: state,
		backendStatus: meta?.status ?? null,
		closeTimestamp: closeTimestamp ?? null,
		tokenAddress: meta?.tokenAddress ?? null,
	});
	const tone = displayStateTone(displayState);
	const pulseTone = STATE_TONE_TO_PULSE[tone];
	const pillTone = STATE_TONE_TO_PILL[tone];
	const stateLabel = displayStateLabel(displayState);
	const headline = displayStateHeadline(displayState);

	const tokenAddress = meta?.tokenAddress ?? null;
	const predictedAddress = meta?.predictedTokenAddress ?? null;
	const displayAddress = tokenAddress ?? predictedAddress;
	const showVanity = displayState !== "presale" && displayState !== "created";
	const bscscan = bscscanTokenUrl(tokenAddress);
	const flap = flapTokenUrl(tokenAddress);
	const pcs = pancakeSwapUrl(tokenAddress);
	const tradeHref = tradeOnWaifuUrl(tokenAddress);

	const capWei = meta?.presaleCapWei ? BigInt(meta.presaleCapWei) : capFromBnb(tier.presaleCapBnb);
	const pct = capWei > 0n ? Number((totalDeposited * 10_000n) / capWei) / 100 : 0;
	const totalBnb = formatBnb(totalDeposited);
	const capBnb = formatBnb(capWei);

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
		<section
			aria-label="Launch summary"
			className={cn(
				"relative grid gap-0 border-b border-[var(--border-soft)] bg-[var(--bg-base)]",
				"grid-cols-1 md:grid-cols-[1.4fr_1fr] lg:grid-cols-[1.5fr_1fr_1.1fr]",
			)}
		>
			{/* identity */}
			<div className="flex items-start gap-4 px-5 py-5 md:py-6">
				<div className="relative shrink-0">
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							alt={`${name} logo`}
							className="relative h-[120px] w-[120px] rounded-md border border-[var(--border-mid)] object-cover md:h-[132px] md:w-[132px]"
							height={132}
							src={image}
							width={132}
						/>
					) : (
						<div className="flex h-[120px] w-[120px] items-center justify-center rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel)] font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] md:h-[132px] md:w-[132px]">
							no logo
						</div>
					)}
				</div>

				<div className="flex min-w-0 flex-col gap-1.5">
					<div className="flex items-center gap-1.5">
						<h1 className="font-medium text-[22px] leading-none tracking-tight text-[var(--text-primary)] lowercase md:text-[24px]">
							{name.toLowerCase()}
						</h1>
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						{symbol && symbol !== "—" ? <StatPill tone="accent">${symbol.toUpperCase()}</StatPill> : null}
						<StatPill tone="neutral">{tier.label.toLowerCase()}</StatPill>
						<span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							<Users className="size-3" /> {depositorCount.toString()} backer{depositorCount === 1n ? "" : "s"}
						</span>
					</div>
					{showVanity && displayAddress ? (
						<div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
							<span className="text-[var(--text-tertiary)]">token</span>
							<span className="tabular-nums text-[var(--text-secondary)]" data-testid="launch-token-address">
								{formatVanityAddress(displayAddress)}
							</span>
							{displayState === "bundling" && !tokenAddress ? (
								<span className="italic text-[var(--text-tertiary)] normal-case tracking-normal">mining…</span>
							) : null}
							{tokenAddress ? (
								<span className="flex items-center gap-2 text-[var(--accent)] normal-case tracking-normal">
									{tradeHref ? (
										<Link
											className="hover:opacity-80 underline-offset-2 hover:underline"
											data-testid="launch-hero-trade-link"
											href={tradeHref}
										>
											trade on waifu →
										</Link>
									) : null}
									{bscscan ? (
										<a className="hover:opacity-80" href={bscscan} rel="noopener noreferrer" target="_blank">
											bscscan ↗
										</a>
									) : null}
									{flap ? (
										<a className="hover:opacity-80" href={flap} rel="noopener noreferrer" target="_blank">
											flap ↗
										</a>
									) : null}
									{pcs ? (
										<a className="hover:opacity-80" href={pcs} rel="noopener noreferrer" target="_blank">
											pcs v2 ↗
										</a>
									) : null}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			</div>

			{/* presale progress */}
			<div className="flex flex-col justify-center gap-2 border-t border-[var(--border-soft)] px-5 py-5 md:border-l md:border-t-0 md:py-6">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					presale progress
				</span>
				<div className="flex items-baseline gap-2 font-mono leading-none tracking-tight">
					<span className="text-[24px] tabular-nums text-[var(--text-primary)] md:text-[28px]">{totalBnb}</span>
					<span className="text-[12px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">/ {capBnb} bnb</span>
				</div>
				<div className="h-1 w-full overflow-hidden rounded-sm bg-white/[0.04]">
					<div
						aria-hidden
						className="h-full rounded-sm bg-[var(--accent)]"
						style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
					/>
				</div>
				<div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
					<span className="text-[var(--text-tertiary)]">{pct.toFixed(2)}% filled</span>
					{bonusPool && bonusPool > 0n ? (
						<span className="text-[var(--accent)]">+{formatBnb(bonusPool)} bnb bonus pool</span>
					) : null}
				</div>
			</div>

			{/* countdown + state */}
			<div className="flex flex-col justify-center gap-2 border-t border-[var(--border-soft)] px-5 py-5 lg:border-l lg:border-t-0 lg:py-6">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					{countdownLabel}
				</span>
				<LaunchCountdown
					className="flex items-baseline gap-2 font-mono text-[24px] tabular-nums leading-none tracking-tight text-[var(--text-primary)] md:text-[28px]"
					closeTimestampSec={closeTimestamp}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<span
						className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]"
						style={pillStyle(pillTone)}
						data-testid="launch-state-badge"
					>
						<Pulse tone={pulseTone} />
						{stateLabel}
					</span>
					<p
						className="max-w-[40ch] text-[11px] leading-relaxed text-[var(--text-secondary)]"
						data-testid="launch-state-headline"
					>
						{headline}
					</p>
				</div>
			</div>
		</section>
	);
}

function pillStyle(tone: "accent" | "neutral" | "negative" | "positive"): React.CSSProperties {
	switch (tone) {
		case "accent":
			return {
				borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
				background: "var(--accent-soft)",
				color: "var(--accent)",
			};
		case "positive":
			return {
				borderColor: "color-mix(in srgb, var(--positive) 30%, transparent)",
				background: "color-mix(in srgb, var(--positive) 10%, transparent)",
				color: "var(--positive)",
			};
		case "negative":
			return {
				borderColor: "color-mix(in srgb, var(--negative) 30%, transparent)",
				background: "color-mix(in srgb, var(--negative) 10%, transparent)",
				color: "var(--negative)",
			};
		default:
			return {
				borderColor: "var(--border-mid)",
				background: "rgba(255,255,255,0.02)",
				color: "var(--text-secondary)",
			};
	}
}

function formatBnb(wei: bigint): string {
	const s = formatEther(wei);
	const n = Number(s);
	if (!Number.isFinite(n)) return s;
	if (n === 0) return "0";
	if (n >= 100) return n.toFixed(1);
	if (n >= 10) return n.toFixed(2);
	if (n >= 1) return n.toFixed(3);
	return n.toFixed(4);
}

function capFromBnb(bnb: number): bigint {
	return BigInt(Math.floor(bnb * 1e6)) * 10n ** 12n;
}
