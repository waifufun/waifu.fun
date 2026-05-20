/**
 * Slim top bar for the agent dashboard.
 *
 * Wave U pulled brand, nav, hamburger, and Connect Wallet out of here.
 * What is left:
 *
 *   LEFT:   (intentionally empty - the sidebar owns brand now)
 *   CENTER: search field
 *   RIGHT:  theme toggle, notification bell, agent picker
 *
 * Height drops from 56px to 48px because there is far less to carry.
 * All colors via CSS variables.
 */

"use client";

import { BellIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { AgentPicker } from "./agent-picker";

export const TOPBAR_HEIGHT = 48;

type TopBarProps = {
	className?: string;
};

export function TopBar({ className }: TopBarProps) {
	return (
		<header
			className={cn(
				"sticky top-0 z-40 flex items-center gap-3 md:gap-4",
				"border-[var(--border-soft)] border-b bg-[var(--bg-base)]",
				"px-3 md:px-4",
				className,
			)}
			style={{ height: TOPBAR_HEIGHT }}
		>
			<div className="hidden flex-1 justify-center md:flex">
				<SearchField />
			</div>

			<div className="ml-auto flex items-center gap-1 md:gap-2">
				<ThemeToggleButton />
				<NotificationBellButton />
				<AgentPicker />
			</div>
		</header>
	);
}

function SearchField() {
	return (
		<label
			className={cn(
				"group flex h-8 w-full max-w-[480px] items-center gap-2 rounded-md border bg-[var(--bg-panel)] px-3",
				"border-[var(--border-soft)] transition-colors focus-within:border-[var(--accent)]/40 hover:border-[var(--border-mid)]",
			)}
		>
			<SearchIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.8} />
			<input
				aria-label="Search agents, tokens, users"
				className={cn(
					"min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none",
					"placeholder:text-[var(--text-tertiary)]",
				)}
				placeholder="Search agents, tokens, users..."
				type="search"
			/>
			<kbd
				aria-hidden
				className={cn(
					"hidden h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] sm:inline-flex",
					"border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-tertiary)]",
				)}
			>
				⌘K
			</kbd>
		</label>
	);
}

function ThemeToggleButton() {
	const [dark, setDark] = useState(true);
	return (
		<button
			aria-label="Toggle theme"
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors",
				"hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
			)}
			onClick={() => setDark((v) => !v)}
			type="button"
		>
			{dark ? <MoonIcon className="h-4 w-4" strokeWidth={1.8} /> : <SunIcon className="h-4 w-4" strokeWidth={1.8} />}
		</button>
	);
}

function NotificationBellButton() {
	return (
		<button
			aria-label="Notifications"
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors",
				"hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
			)}
			type="button"
		>
			<BellIcon className="h-4 w-4" strokeWidth={1.8} />
			<span
				aria-hidden
				className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: "var(--accent)" }}
			/>
		</button>
	);
}
