/**
 * Shared visual primitives for the agent-preview dashboard.
 * All panels (Worker A/B/C/D) compose from these to keep a
 * consistent look and a single point of theming control.
 *
 * Color tokens read from CSS variables. To re-theme a single agent,
 * change --accent / --positive / --negative on the root container
 * and every panel updates.
 */

"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

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
