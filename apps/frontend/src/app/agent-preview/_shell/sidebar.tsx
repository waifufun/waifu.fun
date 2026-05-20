/**
 * Composed left rail for the agent dashboard.
 *
 * Wave U.1 cleanup: the outer site <Header /> (rendered globally in
 * app/layout.tsx) is the only top nav. This sidebar is sticky on the
 * left, starts below the 60px outer header, and only links to routes
 * that actually exist.
 *
 * Top to bottom:
 *
 *   1. Brand block (transparent PNG mark, transparent lockup expanded)
 *   2. Primary nav (6 real-route items)
 *   3. BNB chain status pill
 *
 * Removed in U.1: watchlist, Connect Wallet (sign-in is in outer
 * header), theme toggle (no theme system yet, default dark).
 *
 * Theme via CSS variables. Brand assets are real transparent PNGs
 * under /brand/icon and /brand/lockup.
 */

"use client";

import { motion } from "framer-motion";
import { BookOpenIcon, HomeIcon, RocketIcon, TrophyIcon, UsersIcon, WalletIcon } from "lucide-react";
import Image from "next/image";

import { SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";

// Collapsed and expanded widths echo the Aceternity defaults the brief
// pinned. The provider in app-shell.tsx publishes these as CSS vars so
// downstream layout can offset content without recalc.
export const SIDEBAR_COLLAPSED_PX = 60;
export const SIDEBAR_EXPANDED_PX = 280;

// Outer site <Header /> is sticky top-0, 60px tall. The dashboard
// sidebar pins itself directly underneath.
export const OUTER_HEADER_PX = 60;

const ICON_PROPS = { className: "h-[18px] w-[18px] text-[var(--text-secondary)]", strokeWidth: 1.6 } as const;

const NAV_LINKS = [
	{ id: "overview", label: "Overview", href: "/agent-preview", icon: <HomeIcon {...ICON_PROPS} /> },
	{ id: "agents", label: "Agents", href: "/agents", icon: <UsersIcon {...ICON_PROPS} /> },
	{ id: "launches", label: "Launches", href: "/launches", icon: <RocketIcon {...ICON_PROPS} /> },
	{ id: "portfolio", label: "Portfolio", href: "/patron/portfolio", icon: <WalletIcon {...ICON_PROPS} /> },
	{ id: "leaderboard", label: "Leaderboard", href: "/leaderboard", icon: <TrophyIcon {...ICON_PROPS} /> },
	{ id: "docs", label: "Docs", href: "/litepaper", icon: <BookOpenIcon {...ICON_PROPS} /> },
] as const;

type SidebarInnerProps = {
	activeId?: string | undefined;
};

export function SidebarInner({ activeId = "overview" }: SidebarInnerProps) {
	return (
		<SidebarBody className="sticky top-[60px] h-[calc(100vh-60px)] justify-between gap-4">
			<div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
				<BrandBlock />

				<nav aria-label="Primary navigation" className="mt-4 flex flex-col gap-0.5">
					{NAV_LINKS.map((link) => (
						<SidebarLink active={link.id === activeId} key={link.id} link={link} />
					))}
				</nav>
			</div>

			<ChainStatusPill />
		</SidebarBody>
	);
}

// Brand block uses the transparent variants (no _on_black_ suffix) so
// it sits cleanly on the panel background instead of stamping a black
// rectangle into the sidebar.

function BrandBlock() {
	const { open, animate } = useSidebar();
	return (
		<a aria-label="waifu.fun home" className="flex h-9 shrink-0 items-center gap-2 rounded-md px-1.5" href="/">
			<span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
				<Image alt="waifu.fun" className="h-7 w-auto" height={30} priority src="/brand/icon/icon_128.png" width={28} />
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
					className="h-[30px] w-auto"
					height={30}
					priority
					src="/brand/lockup/lockup_waifu_256.png"
					width={120}
				/>
			</motion.span>
		</a>
	);
}

// Chain status pill: kept from Wave U. Not on Shadow's removal list and
// it gives the rail a useful anchor at the bottom now that Connect
// Wallet and the theme toggle are gone.

function ChainStatusPill() {
	const { open, animate } = useSidebar();
	return (
		<div className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel)] px-2 py-1.5">
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
