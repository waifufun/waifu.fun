/**
 * Composed left rail for the agent dashboard.
 *
 * Replaces the Wave T fixed 56px icon strip with an Aceternity-style
 * expandable sidebar (60px collapsed, 280px expanded, hover to expand).
 * Top to bottom:
 *
 *   1. Brand block (real PNG mark, optional lockup when expanded)
 *   2. Primary nav (full set; the topbar no longer carries nav)
 *   3. Watchlist section (BNB / SOL / BTCB / ETH)
 *   4. Chain status pill (BNB Chain mainnet)
 *   5. Bottom block (Connect Wallet + theme toggle)
 *
 * The "hardcoded portrait of a soul" Shadow flagged is gone.
 *
 * Theme via CSS variables. Brand assets are real PNGs under
 * /brand/icon and /brand/lockup; no more lucide-as-logo.
 */

"use client";

import { motion } from "framer-motion";
import {
	ActivityIcon,
	BoxIcon,
	FileTextIcon,
	GitPullRequestIcon,
	HomeIcon,
	LineChartIcon,
	MessageSquareIcon,
	MoonIcon,
	SettingsIcon,
	SunIcon,
	TrendingUpIcon,
	WalletIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { SidebarBody, SidebarLink, SidebarSectionLabel, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import type { WatchlistEntry } from "../lib/watchlist";

// Collapsed and expanded widths echo the Aceternity defaults the brief
// pinned. The provider in app-shell.tsx publishes these as CSS vars so
// downstream layout can offset content without recalc.
export const SIDEBAR_COLLAPSED_PX = 60;
export const SIDEBAR_EXPANDED_PX = 280;

const ICON_PROPS = { className: "h-[18px] w-[18px] text-[var(--text-secondary)]", strokeWidth: 1.6 } as const;

const NAV_LINKS = [
	{ id: "overview", label: "Overview", href: "/agent-preview", icon: <HomeIcon {...ICON_PROPS} /> },
	{ id: "markets", label: "Markets", href: "#markets", icon: <LineChartIcon {...ICON_PROPS} /> },
	{ id: "treasury", label: "Treasury", href: "#treasury", icon: <WalletIcon {...ICON_PROPS} /> },
	{ id: "apps", label: "Apps", href: "#apps", icon: <BoxIcon {...ICON_PROPS} /> },
	{ id: "activity", label: "Activity", href: "#activity", icon: <ActivityIcon {...ICON_PROPS} /> },
	{ id: "positions", label: "Positions", href: "#positions", icon: <TrendingUpIcon {...ICON_PROPS} /> },
	{ id: "voice", label: "Voice", href: "#voice", icon: <MessageSquareIcon {...ICON_PROPS} /> },
	{ id: "ship-log", label: "Ship Log", href: "#ship-log", icon: <GitPullRequestIcon {...ICON_PROPS} /> },
	{ id: "docs", label: "Docs", href: "#docs", icon: <FileTextIcon {...ICON_PROPS} /> },
	{ id: "settings", label: "Settings", href: "#settings", icon: <SettingsIcon {...ICON_PROPS} /> },
] as const;

type SidebarInnerProps = {
	activeId?: string | undefined;
	watchlist: WatchlistEntry[];
	onConnectWallet?: (() => void) | undefined;
};

export function SidebarInner({ activeId = "overview", watchlist, onConnectWallet }: SidebarInnerProps) {
	return (
		<SidebarBody className="justify-between gap-4">
			<div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
				<BrandBlock />

				<nav aria-label="Primary navigation" className="mt-4 flex flex-col gap-0.5">
					{NAV_LINKS.map((link) => (
						<SidebarLink active={link.id === activeId} key={link.id} link={link} />
					))}
				</nav>

				<WatchlistSection entries={watchlist} />

				<ChainStatusPill />
			</div>

			<BottomBlock onConnectWallet={onConnectWallet} />
		</SidebarBody>
	);
}

// ─── Brand ───────────────────────────────────────────────────────

function BrandBlock() {
	const { open, animate } = useSidebar();
	return (
		<a aria-label="waifu.fun home" className="flex h-9 shrink-0 items-center gap-2 rounded-md px-1.5" href="/">
			<span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
				<Image alt="waifu.fun" className="h-7 w-7" height={28} priority src="/brand/icon/icon_256.png" width={28} />
			</span>
			<motion.span
				animate={{
					display: animate ? (open ? "inline-flex" : "none") : "inline-flex",
					opacity: animate ? (open ? 1 : 0) : 1,
				}}
				className="items-center"
			>
				<Image
					alt="waifu"
					className="h-5 w-auto"
					height={20}
					priority
					src="/brand/lockup/lockup_waifu_256.png"
					width={80}
				/>
			</motion.span>
		</a>
	);
}

// ─── Watchlist ───────────────────────────────────────────────────

function WatchlistSection({ entries }: { entries: WatchlistEntry[] }) {
	const { open, animate } = useSidebar();
	return (
		<div className="mt-4 flex flex-col gap-0.5">
			<SidebarSectionLabel>Watchlist</SidebarSectionLabel>
			{entries.map((entry) => {
				const positive = entry.change24hPct >= 0;
				return (
					<div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]" key={entry.symbol}>
						<span className="flex h-5 w-5 shrink-0 items-center justify-center">
							<Image alt={entry.symbol} className="h-5 w-5 rounded-full" height={20} src={entry.iconHref} width={20} />
						</span>
						<motion.div
							animate={{
								display: animate ? (open ? "flex" : "none") : "flex",
								opacity: animate ? (open ? 1 : 0) : 1,
							}}
							className="min-w-0 flex-1 items-baseline justify-between gap-2"
						>
							<span className="font-mono text-[11px] text-[var(--text-primary)] uppercase tracking-[0.12em]">
								{entry.symbol}
							</span>
							<span className="flex items-baseline gap-2">
								<span className="font-mono text-[11px] text-[var(--text-secondary)]">
									${formatPrice(entry.priceUsd)}
								</span>
								<span
									className="font-mono text-[10px] tabular-nums"
									style={{ color: positive ? "var(--positive)" : "var(--negative)" }}
								>
									{positive ? "+" : ""}
									{entry.change24hPct.toFixed(1)}%
								</span>
							</span>
						</motion.div>
					</div>
				);
			})}
		</div>
	);
}

function formatPrice(usd: number): string {
	if (usd >= 1000) {
		return usd.toLocaleString("en-US", { maximumFractionDigits: 0 });
	}
	if (usd >= 1) {
		return usd.toLocaleString("en-US", { maximumFractionDigits: 2 });
	}
	return usd.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

// ─── Chain status pill ───────────────────────────────────────────

function ChainStatusPill() {
	const { open, animate } = useSidebar();
	return (
		<div className="mt-4 flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel)] px-2 py-1.5">
			<span aria-hidden className="relative flex h-2 w-2 shrink-0 items-center justify-center">
				<span
					className="absolute inset-0 animate-ping rounded-full opacity-60"
					style={{ backgroundColor: "var(--positive)" }}
				/>
				<span className="relative h-2 w-2 rounded-full" style={{ backgroundColor: "var(--positive)" }} />
			</span>
			<motion.div
				animate={{
					display: animate ? (open ? "flex" : "none") : "flex",
					opacity: animate ? (open ? 1 : 0) : 1,
				}}
				className="min-w-0 flex-1 items-baseline justify-between gap-2"
			>
				<span className="font-mono text-[10px] text-[var(--text-primary)] uppercase tracking-[0.18em]">BNB Chain</span>
				<span className="font-mono text-[9px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">Mainnet</span>
			</motion.div>
		</div>
	);
}

// ─── Bottom block: Connect Wallet + theme toggle ─────────────────

function BottomBlock({ onConnectWallet }: { onConnectWallet?: (() => void) | undefined }) {
	return (
		<div className="flex shrink-0 flex-col gap-2 border-[var(--border-soft)] border-t pt-3">
			<ConnectWalletRow onClick={onConnectWallet} />
			<ThemeToggleRow />
		</div>
	);
}

function ConnectWalletRow({ onClick }: { onClick?: (() => void) | undefined }) {
	const { open, animate } = useSidebar();
	return (
		<button
			className={cn(
				"flex h-9 items-center gap-3 overflow-hidden rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-all",
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
			<WalletIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
			<motion.span
				animate={{
					display: animate ? (open ? "inline-block" : "none") : "inline-block",
					opacity: animate ? (open ? 1 : 0) : 1,
				}}
				className="whitespace-pre"
			>
				Connect Wallet
			</motion.span>
		</button>
	);
}

function ThemeToggleRow() {
	const { open, animate } = useSidebar();
	const [dark, setDark] = useState(true);
	return (
		<button
			aria-label="Toggle theme"
			className="flex h-8 items-center gap-3 rounded-md px-2 text-[var(--text-tertiary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
			onClick={() => setDark((v) => !v)}
			type="button"
		>
			<span className="flex h-5 w-5 shrink-0 items-center justify-center">
				{dark ? <MoonIcon className="h-4 w-4" strokeWidth={1.6} /> : <SunIcon className="h-4 w-4" strokeWidth={1.6} />}
			</span>
			<motion.span
				animate={{
					display: animate ? (open ? "inline-block" : "none") : "inline-block",
					opacity: animate ? (open ? 1 : 0) : 1,
				}}
				className="whitespace-pre text-[11px] uppercase tracking-[0.16em]"
			>
				{dark ? "Dark" : "Light"} theme
			</motion.span>
		</button>
	);
}
