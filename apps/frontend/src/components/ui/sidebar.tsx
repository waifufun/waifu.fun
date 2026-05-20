/**
 * Aceternity-style expandable sidebar primitives.
 *
 * Hover-driven on desktop (60px collapsed, 280px expanded), animated
 * with framer-motion. Mobile renders a dismissible drawer triggered by
 * a hamburger button.
 *
 * Theme via CSS variables only. Icon imports use lucide-react (a dep
 * the app already ships) instead of the upstream @tabler/icons-react.
 * Links use a plain <a> so static export does not need next/link routing
 * for placeholder hash hrefs.
 *
 * Usage:
 *   <Sidebar>
 *     <SidebarBody>
 *       ...SidebarLink, SidebarSection, etc.
 *     </SidebarBody>
 *   </Sidebar>
 *
 * Read open/animate state in children via useSidebar().
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MenuIcon, XIcon } from "lucide-react";
import { type Dispatch, type SetStateAction, createContext, useContext, useState } from "react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export type SidebarLinkItem = {
	label: string;
	href: string;
	icon: React.ReactNode;
};

type SidebarContextValue = {
	open: boolean;
	setOpen: Dispatch<SetStateAction<boolean>>;
	animate: boolean;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
	const ctx = useContext(SidebarContext);
	if (!ctx) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return ctx;
}

type SidebarProviderProps = {
	children: React.ReactNode;
	open?: boolean | undefined;
	setOpen?: Dispatch<SetStateAction<boolean>> | undefined;
	animate?: boolean | undefined;
};

export function SidebarProvider({
	children,
	open: openProp,
	setOpen: setOpenProp,
	animate = true,
}: SidebarProviderProps) {
	const [openState, setOpenState] = useState(false);
	const open = openProp !== undefined ? openProp : openState;
	const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;
	return <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>;
}

export function Sidebar(props: SidebarProviderProps) {
	return <SidebarProvider {...props} />;
}

type SidebarBodyProps = {
	children: React.ReactNode;
	className?: string | undefined;
};

export function SidebarBody(props: SidebarBodyProps) {
	return (
		<>
			<DesktopSidebar {...props} />
			<MobileSidebar {...props} />
		</>
	);
}

export function DesktopSidebar({ className, children }: SidebarBodyProps) {
	const { open, setOpen, animate } = useSidebar();
	return (
		<motion.div
			animate={{ width: animate ? (open ? "280px" : "60px") : "280px" }}
			className={cn(
				"hidden h-full flex-shrink-0 flex-col overflow-hidden px-3 py-4 md:flex",
				"border-[var(--border-soft)] border-r bg-[var(--bg-base)]",
				className,
			)}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
			transition={{ type: "spring", stiffness: 220, damping: 28 }}
		>
			{children}
		</motion.div>
	);
}

export function MobileSidebar({ className, children }: SidebarBodyProps) {
	const { open, setOpen } = useSidebar();
	return (
		<div
			className={cn(
				"flex h-12 w-full items-center justify-between px-4 md:hidden",
				"border-[var(--border-soft)] border-b bg-[var(--bg-base)]",
			)}
		>
			<button
				aria-label="Open menu"
				className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
				onClick={() => setOpen(!open)}
				type="button"
			>
				<MenuIcon className="h-4 w-4" strokeWidth={1.8} />
			</button>
			<AnimatePresence>
				{open ? (
					<motion.div
						animate={{ x: 0, opacity: 1 }}
						className={cn(
							"fixed inset-0 z-[100] flex flex-col p-6",
							"bg-[var(--bg-base)] text-[var(--text-primary)]",
							className,
						)}
						exit={{ x: "-100%", opacity: 0 }}
						initial={{ x: "-100%", opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
					>
						<button
							aria-label="Close menu"
							className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
							onClick={() => setOpen(false)}
							type="button"
						>
							<XIcon className="h-4 w-4" strokeWidth={1.8} />
						</button>
						{children}
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

type SidebarLinkProps = {
	link: SidebarLinkItem;
	className?: string | undefined;
	active?: boolean | undefined;
};

export function SidebarLink({ link, className, active = false }: SidebarLinkProps) {
	const { open, animate } = useSidebar();
	return (
		<a
			aria-current={active ? "page" : undefined}
			className={cn(
				"group/sidebar flex items-center justify-start gap-3 rounded-md px-2 py-2 transition-colors",
				active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-white/[0.04]",
				className,
			)}
			href={link.href}
		>
			<span className="flex h-5 w-5 shrink-0 items-center justify-center">{link.icon}</span>
			<motion.span
				animate={{
					display: animate ? (open ? "inline-block" : "none") : "inline-block",
					opacity: animate ? (open ? 1 : 0) : 1,
				}}
				className={cn(
					"inline-block whitespace-pre text-sm transition group-hover/sidebar:translate-x-0.5",
					active
						? "text-[var(--accent)]"
						: "text-[var(--text-secondary)] group-hover/sidebar:text-[var(--text-primary)]",
				)}
			>
				{link.label}
			</motion.span>
		</a>
	);
}

/**
 * A section header that is visible only when the sidebar is expanded.
 * Use it to label groups (e.g., WATCHLIST) without breaking the
 * collapsed-rail layout.
 */
export function SidebarSectionLabel({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string | undefined;
}) {
	const { open, animate } = useSidebar();
	return (
		<motion.div
			animate={{
				display: animate ? (open ? "block" : "none") : "block",
				opacity: animate ? (open ? 1 : 0) : 1,
			}}
			className={cn(
				"px-2 pt-3 pb-1 font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]",
				className,
			)}
		>
			{children}
		</motion.div>
	);
}
