"use client";

import { useEffect, useState } from "react";

type Props = {
	closeTimestampSec: bigint | number | null | undefined;
	className?: string;
	compact?: boolean;
};

/**
 * Countdown to the vault `closeTimestamp`. Re-renders once per second and
 * shows "round closed" once the deadline passes (the vault flips OPEN -> CLOSED
 * shortly after; the page itself reads `state` from on-chain to drive UI).
 */
export function LaunchCountdown({ closeTimestampSec, className, compact = false }: Props) {
	const target = useTargetMs(closeTimestampSec);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(id);
	}, []);

	if (target === null) {
		return <div className={className ?? "text-sm text-zinc-400"}>round window not set</div>;
	}

	const remainingMs = Math.max(0, target - now);
	if (remainingMs <= 0) {
		return <div className={className ?? "text-2xl font-semibold tabular-nums text-zinc-300"}>round closed</div>;
	}

	const totalSec = Math.floor(remainingMs / 1000);
	const hours = Math.floor(totalSec / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	const seconds = totalSec % 60;

	if (compact) {
		return (
			<span className={className ?? "tabular-nums text-zinc-300"}>
				{pad(hours)}:{pad(minutes)}:{pad(seconds)}
			</span>
		);
	}

	return (
		<div className={className ?? "flex items-baseline gap-2"}>
			<TimeBlock value={hours} label="hours" />
			<span className="text-zinc-500">:</span>
			<TimeBlock value={minutes} label="min" />
			<span className="text-zinc-500">:</span>
			<TimeBlock value={seconds} label="sec" />
		</div>
	);
}

function TimeBlock({ value, label }: { value: number; label: string }) {
	return (
		<div className="flex flex-col items-center">
			<span className="text-4xl font-semibold tabular-nums leading-none text-zinc-100 md:text-5xl">{pad(value)}</span>
			<span className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{label}</span>
		</div>
	);
}

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function useTargetMs(closeTimestampSec: bigint | number | null | undefined): number | null {
	if (closeTimestampSec === null || closeTimestampSec === undefined) return null;
	const asNumber = typeof closeTimestampSec === "bigint" ? Number(closeTimestampSec) : closeTimestampSec;
	if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
	return asNumber * 1000;
}
