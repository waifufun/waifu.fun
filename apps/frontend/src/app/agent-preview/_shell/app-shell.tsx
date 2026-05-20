/**
 * AppShell: composes the Aceternity expandable sidebar and reserves
 * space for the main content. Any page that wants the dashboard
 * chrome wraps its content in <AppShell>.
 *
 * Wave U.1: the inner dashboard topbar is gone. The outer site
 * <Header /> (rendered globally in app/layout.tsx) is the only top
 * nav. The sidebar pins itself directly under that header via
 * position: sticky.
 *
 * Layout is a CSS flexbox: sidebar is a real flex sibling of the main
 * column instead of fixed-positioned, so when the sidebar animates
 * between 60px and 280px the content reflows naturally.
 *
 * The shell wraps everything in <Sidebar> (which is <SidebarProvider>
 * under the hood) so any descendant can read open/animate state via
 * useSidebar().
 */

"use client";

import type * as React from "react";

import { Sidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { SidebarInner } from "./sidebar";

type AppShellProps = {
	children: React.ReactNode;
	activeNavId?: string | undefined;
	className?: string | undefined;
};

export function AppShell({ children, activeNavId, className }: AppShellProps) {
	return (
		<Sidebar>
			<div
				className={cn(
					"relative flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)] md:flex-row",
					className,
				)}
			>
				<SidebarInner activeId={activeNavId ?? "overview"} />

				<div className="flex min-w-0 flex-1 flex-col">
					<main className="min-w-0 flex-1">{children}</main>
				</div>
			</div>
		</Sidebar>
	);
}
