"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";

type Props = {
	vestingEnabled: boolean;
	/** Unix seconds of TGE / Launched event. When null we render a static schedule. */
	launchTimestamp?: bigint | null;
	/** User-specific token amounts. Defaulted to 0n so the component is safe to render unconnected. */
	allocation?: bigint;
	claimed?: bigint;
	claimable?: bigint;
};

const VESTING_WINDOW_SEC = 30 * 24 * 60 * 60;

/**
 * Visual mirror of `LaunchVault` vesting math:
 *   - vestingEnabled=false: 100% unlock at TGE.
 *   - vestingEnabled=true:  50% TGE + 50% linear over 30d.
 *
 * When `launchTimestamp` is provided post-launch, the bar ticks in real time
 * and the locked/claimable readouts surface beneath.
 */
export function VestingTimeline({
	vestingEnabled,
	launchTimestamp,
	allocation = 0n,
	claimed = 0n,
	claimable = 0n,
}: Props) {
	const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

	useEffect(() => {
		if (!launchTimestamp || launchTimestamp <= 0n) return;
		const update = () => setNow(Math.floor(Date.now() / 1000));
		const id = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) return;
			update();
		}, 1_000);
		const onVisible = () => {
			if (!document.hidden) update();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [launchTimestamp]);

	if (!vestingEnabled) {
		return (
			<div className="border border-white/10 bg-[#111114] p-4 text-sm text-zinc-300">
				<div className="mb-1 font-medium text-zinc-100">100% at launch</div>
				<div className="text-xs text-zinc-500">
					all presale tokens unlock the moment the round closes and trading opens.
				</div>
			</div>
		);
	}

	const launchSec = launchTimestamp ? Number(launchTimestamp) : null;
	const elapsedSec = launchSec ? Math.max(0, now - launchSec) : null;
	const linearFrac = elapsedSec === null ? 0 : Math.min(1, elapsedSec / VESTING_WINDOW_SEC);
	const totalUnlockedFrac = launchSec ? 0.5 + 0.5 * linearFrac : 0;
	const locked = allocation > 0n ? allocation - claimed - claimable : 0n;
	const lockedDisplay = locked > 0n ? locked : 0n;

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-2 text-sm">
				<div className="border border-white/10 bg-[#111114] p-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">tge</div>
					<div className="mt-1 text-zinc-100">50% unlocked</div>
				</div>
				<div className="border border-white/10 bg-[#111114] p-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">+30d</div>
					<div className="mt-1 text-zinc-100">100% unlocked</div>
				</div>
			</div>
			<div
				className="relative h-2 w-full border border-white/10 bg-[#111114]"
				role="progressbar"
				tabIndex={0}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(totalUnlockedFrac * 100)}
				aria-label={`${Math.round(totalUnlockedFrac * 100)}% unlocked`}
			>
				{launchSec ? (
					<div
						className="absolute inset-y-0 left-0 bg-[#00ff87]/70 transition-[width] duration-500"
						style={{ width: `${Math.round(totalUnlockedFrac * 100)}%` }}
					/>
				) : (
					<>
						<div className="absolute left-0 top-0 h-full w-1/2 bg-[#00ff87]/70" />
						<div className="absolute left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-[#00ff87]/70 to-[#00ff87]/20" />
					</>
				)}
			</div>
			<p className="text-xs text-zinc-500">
				50% claimable at tge, the remaining 50% vests linearly over the first 30d post-launch.
			</p>
			{launchSec && allocation > 0n ? (
				<dl className="grid grid-cols-3 gap-2 pt-1">
					<Stat label="claimable" value={formatTokenAmount(claimable)} accent />
					<Stat label="claimed" value={formatTokenAmount(claimed)} />
					<Stat label="locked" value={formatTokenAmount(lockedDisplay)} />
				</dl>
			) : null}
		</div>
	);
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
	return (
		<div className="border border-white/10 bg-[#0b0b0d] px-2 py-2">
			<div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500">{label}</div>
			<div className={accent ? "mt-1 tabular-nums text-[#00ff87]" : "mt-1 tabular-nums text-zinc-100"}>{value}</div>
		</div>
	);
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
