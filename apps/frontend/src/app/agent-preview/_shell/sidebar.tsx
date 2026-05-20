/**
 * Fixed left rail for the agent dashboard.
 *
 * Vertical strip of icons that mirrors the reference's institutional
 * trading-terminal navigation. The active route gets an accent-tinted
 * tile so the eye finds it immediately; everything else is muted.
 *
 * Theming is via CSS variables only. Swap --accent on the root and
 * the active indicator follows.
 */

"use client";

import {
	BoxIcon,
	FileTextIcon,
	HomeIcon,
	LineChartIcon,
	SlidersHorizontalIcon,
	SparklesIcon,
	SunIcon,
	UsersIcon,
} from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export const SIDEBAR_WIDTH = 56;

type NavItem = {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	href?: string;
};

const NAV: NavItem[] = [
	{ id: "home", label: "Overview", icon: HomeIcon, href: "/agent-preview" },
	{ id: "controls", label: "Controls", icon: SlidersHorizontalIcon },
	{ id: "markets", label: "Markets", icon: LineChartIcon },
	{ id: "docs", label: "Docs", icon: FileTextIcon },
	{ id: "apps", label: "Apps", icon: BoxIcon },
	{ id: "community", label: "Community", icon: UsersIcon },
	{ id: "spark", label: "Discover", icon: SparklesIcon },
];

type SidebarProps = {
	activeId?: string;
	className?: string;
};

export function Sidebar({ activeId = "home", className }: SidebarProps) {
	return (
		<aside
			aria-label="Primary navigation"
			className={cn(
				"fixed top-[var(--topbar-h,56px)] bottom-0 left-0 z-40 hidden md:flex",
				"flex-col items-center justify-between",
				"border-[var(--border-soft)] border-r bg-[var(--bg-base)]",
				"py-3",
				className,
			)}
			style={{ width: SIDEBAR_WIDTH }}
		>
			<nav className="flex flex-col items-center gap-1">
				{NAV.map((item) => (
					<NavTile key={item.id} active={item.id === activeId} item={item} />
				))}
			</nav>

			<div className="flex flex-col items-center gap-2">
				<div aria-hidden className="h-px w-7 bg-[var(--border-soft)]" />
				<button
					aria-label="Agent profile"
					className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--border-mid)] bg-[var(--bg-panel-hi)] transition-colors hover:border-[var(--accent)]/40"
					type="button"
				>
					<img
						alt="sol"
						className="h-full w-full object-cover"
						height={28}
						src="/brand/agents/waifu/portrait-amber.webp"
						width={28}
					/>
				</button>
				<button
					aria-label="Toggle theme"
					className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
					type="button"
				>
					<SunIcon className="h-4 w-4" strokeWidth={1.6} />
				</button>
			</div>
		</aside>
	);
}

function NavTile({ active, item }: { active: boolean; item: NavItem }) {
	const Icon = item.icon;
	const content = (
		<span
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
				active
					? "bg-[var(--accent-soft)] text-[var(--accent)]"
					: "text-[var(--text-tertiary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
			)}
		>
			<Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
			{active ? (
				<span
					aria-hidden
					className="absolute top-1/2 left-0 h-4 w-px -translate-x-[6px] -translate-y-1/2 bg-[var(--accent)]"
					style={{ boxShadow: "0 0 6px var(--accent)" }}
				/>
			) : null}
			<span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded border border-[var(--border-mid)] bg-[var(--bg-panel-hi)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.18em] opacity-0 transition-opacity group-hover:opacity-100 md:block">
				{item.label}
			</span>
		</span>
	);

	if (item.href) {
		return (
			<a aria-current={active ? "page" : undefined} aria-label={item.label} href={item.href}>
				{content}
			</a>
		);
	}

	return (
		<button aria-label={item.label} type="button">
			{content}
		</button>
	);
}
