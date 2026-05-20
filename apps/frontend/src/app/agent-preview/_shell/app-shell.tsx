/**
 * AppShell: composes the persistent top bar + left rail and reserves
 * the right amount of space for the main content. Any page that
 * wants the dashboard chrome wraps its content in <AppShell>.
 *
 * Variables it sets:
 *   --topbar-h: height of the top bar, used by the sidebar to offset
 *   --sidebar-w: width of the left rail, used by the main content
 *
 * On mobile (<768px) the sidebar collapses out of view and content
 * stretches to full width; the top bar shrinks the search field.
 */

"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

import { SIDEBAR_WIDTH, Sidebar } from "./sidebar";
import { TOPBAR_HEIGHT, TopBar } from "./topbar";

type AppShellProps = {
	children: React.ReactNode;
	activeNavId?: string;
	className?: string;
};

export function AppShell({ children, activeNavId, className }: AppShellProps) {
	return (
		<div
			className={cn("relative min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]", className)}
			style={
				{
					"--topbar-h": `${TOPBAR_HEIGHT}px`,
					"--sidebar-w": `${SIDEBAR_WIDTH}px`,
				} as React.CSSProperties
			}
		>
			<TopBar />
			<Sidebar activeId={activeNavId ?? "home"} />

			<main
				className="relative"
				style={{
					paddingTop: TOPBAR_HEIGHT,
					paddingLeft: 0,
				}}
			>
				<div className="md:pl-[var(--sidebar-w)]" style={{ minHeight: `calc(100vh - ${TOPBAR_HEIGHT}px)` }}>
					{children}
				</div>
			</main>
		</div>
	);
}
