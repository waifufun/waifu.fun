/**
 * Shared visual primitives for the Wave T agent home panels.
 * All panels (Worker A/B/C/D) compose from these to keep a
 * consistent look and a single point of theming control.
 *
 * Color tokens read from CSS variables. To re-theme a single agent,
 * change --accent / --positive / --negative on the root container
 * and every panel updates.
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { type TokenChain, resolveTokenLogo } from "@/lib/wave-t/token-logo";
import { getVenueLogo, getVenueMeta } from "@/lib/wave-t/venues";

// ── theme tokens (consumed via CSS vars, set in dashboard.tsx root) ─

export const THEME_TOKENS = {
	"--accent": "#00ff87",
	"--accent-soft": "rgba(0, 255, 135, 0.12)",
	"--accent-dim": "#00cc6a",
	"--bg-base": "#08080a",
	"--bg-panel": "#0b0b0e",
	"--bg-panel-hi": "#111114",
	"--border-soft": "rgba(255, 255, 255, 0.05)",
	"--border-mid": "rgba(255, 255, 255, 0.08)",
	"--text-primary": "#e8e8eb",
	"--text-secondary": "rgba(255, 255, 255, 0.55)",
	"--text-tertiary": "rgba(255, 255, 255, 0.32)",
	"--positive": "#6dd668",
	"--negative": "#ff5b5b",
	"--neutral": "rgba(255, 255, 255, 0.45)",
} as const;

// ── Panel ────────────────────────────────────────────────────────

export function Panel({
	children,
	className = "",
	noPad = false,
}: {
	children: React.ReactNode;
	className?: string;
	noPad?: boolean;
}) {
	return (
		<section
			className={cn(
				"relative overflow-hidden rounded-md border bg-[var(--bg-panel)]",
				"border-[var(--border-soft)] transition-colors hover:border-[var(--border-mid)]",
				noPad ? "" : "p-4 md:p-5",
				className,
			)}
		>
			{children}
		</section>
	);
}

// ── Panel header label ──────────────────────────────────────────

export function Label({
	children,
	right,
	className = "",
}: {
	children: React.ReactNode;
	right?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("mb-4 flex items-center justify-between", className)}>
			<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
				{children}
			</div>
			{right}
		</header>
	);
}

// ── Live pulse dot ──────────────────────────────────────────────

export function Pulse({ tone = "accent" }: { tone?: "accent" | "positive" | "negative" }) {
	const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--accent)";
	return (
		<span className="relative inline-flex h-1.5 w-1.5 shrink-0">
			<span
				className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
				style={{ backgroundColor: color }}
			/>
			<span
				className="relative inline-flex h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
			/>
		</span>
	);
}

// ── Stat pill ────────────────────────────────────────────────────

export function StatPill({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: "neutral" | "accent" | "positive" | "negative";
}) {
	const cls =
		tone === "accent"
			? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
			: tone === "positive"
				? "border-[var(--positive)]/30 bg-[var(--positive)]/10 text-[var(--positive)]"
				: tone === "negative"
					? "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]"
					: "border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-secondary)]";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]",
				cls,
			)}
		>
			{children}
		</span>
	);
}

// ── Hairline divider ───────────────────────────────────────────

export function Hairline({ className = "" }: { className?: string }) {
	return <div className={cn("h-px w-full bg-[var(--border-soft)]", className)} />;
}

// ── KPI mini-stat (label + value stacked) ──────────────────────

export function MicroStat({
	label,
	value,
	tone = "neutral",
	className = "",
}: {
	label: string;
	value: React.ReactNode;
	tone?: "neutral" | "positive" | "negative" | "accent";
	className?: string;
}) {
	const colorCls =
		tone === "positive"
			? "text-[var(--positive)]"
			: tone === "negative"
				? "text-[var(--negative)]"
				: tone === "accent"
					? "text-[var(--accent)]"
					: "text-[var(--text-primary)]";
	return (
		<div className={cn("flex flex-col gap-0.5", className)}>
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</span>
			<span className={cn("font-mono text-[13px] tabular-nums", colorCls)}>{value}</span>
		</div>
	);
}

// ── Section title (larger Label, for hero blocks) ──────────────

export function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h3 className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{children}</h3>;
}

// ── Token + Venue icons ────────────────────────────────────────
//
// TokenIcon renders an asynchronously-resolved token logo with a stable
// fallback gradient circle so it never causes layout shift. It is
// static-export safe: resolution only fires inside useEffect, so SSG
// renders the fallback and the browser swaps in the real image on mount.
//
// VenueIcon is sync (mapped to a local SVG) and falls back to the venue's
// primary brand color in a tinted circle when the SVG fails to load.

function hashHue(input: string): number {
	let h = 0;
	for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
	return h % 360;
}

function GradientCircle({
	seed,
	label,
	size,
}: {
	seed: string;
	label: string;
	size: number;
}) {
	const hue = hashHue(seed || label || "x");
	const hueB = (hue + 40) % 360;
	const bg = `linear-gradient(135deg, hsl(${hue} 70% 38%), hsl(${hueB} 70% 22%))`;
	return (
		<span
			aria-hidden
			className="inline-flex shrink-0 items-center justify-center rounded-full font-mono uppercase text-white/85"
			style={{
				width: size,
				height: size,
				fontSize: Math.max(8, Math.round(size * 0.45)),
				background: bg,
				boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
			}}
		>
			{(label || "?").slice(0, 1)}
		</span>
	);
}

export type TokenIconProps = {
	chain: TokenChain;
	address: string;
	symbol?: string;
	size?: number;
	className?: string;
};

export function TokenIcon({ chain, address, symbol, size = 16, className }: TokenIconProps) {
	const [src, setSrc] = React.useState<string | null>(null);
	const [failed, setFailed] = React.useState(false);

	React.useEffect(() => {
		let alive = true;
		setFailed(false);
		resolveTokenLogo({ chain, address, ...(symbol ? { symbol } : {}) })
			.then((url) => {
				if (alive) setSrc(url);
			})
			.catch(() => {
				if (alive) setSrc(null);
			});
		return () => {
			alive = false;
		};
	}, [chain, address, symbol]);

	if (!src || failed) {
		return (
			<span className={className}>
				<GradientCircle seed={`${chain}:${address}`} label={symbol ?? "?"} size={size} />
			</span>
		);
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			alt={symbol ? `${symbol} logo` : "token logo"}
			className={cn("inline-block shrink-0 rounded-full bg-black/20", className)}
			height={size}
			onError={() => setFailed(true)}
			src={src}
			style={{ width: size, height: size }}
			width={size}
		/>
	);
}

export function VenueIcon({
	venue,
	size = 16,
	className,
	withLabel = false,
}: {
	venue: string;
	size?: number;
	className?: string;
	withLabel?: boolean;
}) {
	const meta = getVenueMeta(venue);
	const src = meta?.logo ?? getVenueLogo(venue);
	const [failed, setFailed] = React.useState(false);
	const label = meta?.label ?? venue;

	if (!src || failed) {
		return (
			<span className={cn("inline-flex items-center gap-1.5", className)}>
				<span
					aria-hidden
					className="inline-flex shrink-0 items-center justify-center rounded-full font-mono uppercase"
					style={{
						width: size,
						height: size,
						fontSize: Math.max(8, Math.round(size * 0.45)),
						background: meta ? `${meta.color}22` : "rgba(255,255,255,0.06)",
						color: meta?.accent ?? "rgba(255,255,255,0.7)",
						boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
					}}
				>
					{label.slice(0, 1)}
				</span>
				{withLabel ? <span className="text-[var(--text-secondary)]">{label}</span> : null}
			</span>
		);
	}

	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				alt={`${label} logo`}
				className="inline-block shrink-0 rounded-full bg-black/20"
				height={size}
				onError={() => setFailed(true)}
				src={src}
				style={{ width: size, height: size }}
				width={size}
			/>
			{withLabel ? <span className="text-[var(--text-secondary)]">{label}</span> : null}
		</span>
	);
}
