/**
 * AppShell: composes the slim top bar + Aceternity expandable sidebar
 * and reserves the right amount of space for the main content. Any
 * page that wants the dashboard chrome wraps its content in <AppShell>.
 *
 * Layout is a CSS flexbox: sidebar is a real flex sibling of the main
 * column instead of fixed-positioned, so when the sidebar animates
 * between 60px and 280px the content reflows naturally. No fixed
 * positioning, no CSS variable juggling for content offset.
 *
 * The shell wraps everything in <Sidebar> (which is <SidebarProvider>
 * under the hood) so any descendant - sidebar items, page widgets -
 * can read open/animate state via useSidebar().
 */

"use client";

import type * as React from "react";

import { Sidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import type { WatchlistEntry } from "../lib/watchlist";
import { SidebarInner } from "./sidebar";
import { TOPBAR_HEIGHT, TopBar } from "./topbar";

type AppShellProps = {
	children: React.ReactNode;
	activeNavId?: string | undefined;
	watchlist: WatchlistEntry[];
	className?: string | undefined;
	onConnectWallet?: (() => void) | undefined;
};

export function AppShell({ children, activeNavId, watchlist, className, onConnectWallet }: AppShellProps) {
	return (
		<Sidebar>
			<div
				className={cn(
					"relative flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)] md:flex-row",
					className,
				)}
				style={
					{
						"--topbar-h": `${TOPBAR_HEIGHT}px`,
					} as React.CSSProperties
				}
			>
				<SidebarInner activeId={activeNavId ?? "overview"} onConnectWallet={onConnectWallet} watchlist={watchlist} />

				<div className="flex min-w-0 flex-1 flex-col">
					<TopBar />
					<main className="min-w-0 flex-1">{children}</main>
				</div>
			</div>
		</Sidebar>
	);
}
