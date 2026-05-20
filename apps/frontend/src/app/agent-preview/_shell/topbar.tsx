/**
 * Top bar for the agent dashboard.
 *
 * Single 56px row: brand on the left, command palette search in the
 * middle, agent picker + wallet CTA on the right. Mirrors the layout
 * of any institutional trading terminal so traders feel at home.
 *
 * All colors via CSS variables. The "Connect Wallet" button is the
 * one element allowed to lean on the accent for legibility (the
 * primary action on the page).
 */

"use client";

import { MenuIcon, SearchIcon, SparklesIcon, WalletIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { AgentPicker } from "./agent-picker";

export const TOPBAR_HEIGHT = 56;

type TopBarProps = {
	className?: string;
	onConnectWallet?: () => void;
};

export function TopBar({ className, onConnectWallet }: TopBarProps) {
	return (
		<header
			className={cn(
				"fixed top-0 right-0 left-0 z-50 flex items-center gap-3 md:gap-4",
				"border-[var(--border-soft)] border-b bg-[var(--bg-base)]",
				"px-3 md:px-4",
				className,
			)}
			style={{ height: TOPBAR_HEIGHT }}
		>
			<Brand />

			<div className="hidden flex-1 justify-center md:flex">
				<SearchField />
			</div>

			<div className="ml-auto flex items-center gap-2 md:ml-0 md:gap-3">
				<AgentPicker />
				<ConnectWalletButton onClick={onConnectWallet} />
				<button
					aria-label="Open menu"
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors",
						"hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
					)}
					type="button"
				>
					<MenuIcon className="h-4 w-4" strokeWidth={1.8} />
				</button>
			</div>
		</header>
	);
}

function Brand() {
	return (
		<a aria-label="waifu.fun home" className="flex shrink-0 items-center gap-2 pr-2" href="/">
			<span
				className="flex h-6 w-6 items-center justify-center rounded-sm"
				style={{
					backgroundColor: "var(--accent-soft)",
					boxShadow: "inset 0 0 0 1px rgba(0,255,135,0.18)",
				}}
			>
				<SparklesIcon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--accent)" }} />
			</span>
			<span className="font-mono text-[13px] text-[var(--text-primary)] uppercase tracking-[0.12em]">
				waifu<span className="text-[var(--text-tertiary)]">.</span>fun
			</span>
		</a>
	);
}

function SearchField() {
	return (
		<label
			className={cn(
				"group flex h-9 w-full max-w-[480px] items-center gap-2 rounded-md border bg-[var(--bg-panel)] px-3",
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
				placeholder="Search agents, tokens, users…"
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

function ConnectWalletButton({ onClick }: { onClick?: (() => void) | undefined }) {
	return (
		<button
			className={cn(
				"connect-wallet inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-mono text-[11px] uppercase tracking-[0.16em] transition-all",
				"hover:brightness-110 active:scale-[0.98]",
			)}
			onClick={onClick}
			style={{
				backgroundColor: "var(--accent)",
				color: "#04140b",
				boxShadow: "0 0 0 1px rgba(0,255,135,0.35), 0 6px 18px -8px rgba(0,255,135,0.55)",
			}}
			type="button"
		>
			<WalletIcon className="h-3.5 w-3.5" strokeWidth={2} />
			<span className="hidden sm:inline">Connect Wallet</span>
			<span className="sm:hidden">Connect</span>
		</button>
	);
}
