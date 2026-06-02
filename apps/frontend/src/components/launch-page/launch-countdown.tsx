"use client";

import { useEffect, useState } from "react";

import { formatRemainingHumanized } from "./countdown-format";

type Props = {
	closeTimestampSec: bigint | number | null | undefined;
	className?: string;
	compact?: boolean;
	/**
	 * "humanized" → "2d 4h 17m" for >1h, "47m 23s" for <1h, "closed" past.
	 * "blocks" → numeric HH:MM:SS blocks (default, used in the hero).
	 */
	format?: "humanized" | "blocks";
};

/**
 * Countdown to the vault `closeTimestamp`. Re-renders once per second and
 * shows "round closed" once the deadline passes (the vault flips OPEN -> CLOSED
 * shortly after; the page itself reads `state` from on-chain to drive UI).
 */
export function LaunchCountdown({ closeTimestampSec, className, compact = false, format = "blocks" }: Props) {
	const target = useTargetMs(closeTimestampSec);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		// Skip ticking while the tab is hidden (launch-card mounts one of these per
		// launch in the live rail); resync on visibilitychange so the display is
		// correct the instant the tab is focused again.
		const id = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) return;
			setNow(Date.now());
		}, 1_000);
		const onVisible = () => {
			if (!document.hidden) setNow(Date.now());
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	if (target === null) {
		return (
			<div className={className ?? "text-sm text-zinc-400"} aria-label="round window not set">
				round window not set
			</div>
		);
	}

	const remainingMs = Math.max(0, target - now);
	if (remainingMs <= 0) {
		return (
			<output className={className ?? "text-2xl font-semibold tabular-nums text-zinc-300"} aria-label="round closed">
				{format === "humanized" ? "closed" : "round closed"}
			</output>
		);
	}

	const totalSec = Math.floor(remainingMs / 1000);
	const days = Math.floor(totalSec / 86400);
	const hours = Math.floor((totalSec % 86400) / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	const seconds = totalSec % 60;
	const ariaText = `${days > 0 ? `${days} days ` : ""}${hours} hours ${minutes} minutes ${seconds} seconds remaining`;

	if (format === "humanized") {
		const text = formatRemainingHumanized(remainingMs);
		return (
			<span className={className ?? "tabular-nums text-zinc-200"} role="timer" aria-live="off" aria-label={ariaText}>
				{text}
			</span>
		);
	}

	if (compact) {
		return (
			<span className={className ?? "tabular-nums text-zinc-300"} role="timer" aria-live="off" aria-label={ariaText}>
				{days > 0 ? `${days}d ` : ""}
				{pad(hours)}:{pad(minutes)}:{pad(seconds)}
			</span>
		);
	}

	return (
		<div className={className ?? "flex items-baseline gap-2"} role="timer" aria-live="off" aria-label={ariaText}>
			{days > 0 ? (
				<>
					<TimeBlock value={days} label="days" />
					<span className="text-zinc-500">:</span>
				</>
			) : null}
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
			<span className="text-3xl font-semibold tabular-nums leading-none text-zinc-100 md:text-5xl">{pad(value)}</span>
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
