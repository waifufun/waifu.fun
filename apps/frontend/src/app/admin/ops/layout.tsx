"use client";

import OpsTokenGate from "@/components/admin/ops-token-gate";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface AdminOpsLayoutProps {
	children: React.ReactNode;
}

const OPS_NAV = [
	{ href: "/admin/ops", label: "Agents" },
	{ href: "/admin/ops/audit", label: "Audit Log" },
];

export default function AdminOpsLayout({ children }: AdminOpsLayoutProps) {
	const pathname = usePathname();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className="min-h-[100dvh] bg-[#08080a] text-white">
			{/* Hard-coded red banner so an operator never confuses /admin/ops with a normal page. */}
			<div
				role="alert"
				aria-live="polite"
				className="w-full bg-red-600/90 text-white text-xs font-mono uppercase tracking-[0.2em] py-1.5 px-4 text-center border-b border-red-400/40"
			>
				⚠ admin · destructive controls · audited
			</div>

			<header className="border-b border-red-500/20 bg-[#0a0a0c]">
				<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold">
							A
						</span>
						<div>
							<h1 className="text-sm font-mono uppercase tracking-wider text-white">Admin Ops</h1>
							<p className="text-[10px] font-mono text-red-300/70">kill-switch · break-glass</p>
						</div>
					</div>
					{mounted ? <OpsTokenGate.LogoutButton /> : null}
				</div>
				<nav
					aria-label="Admin ops navigation"
					className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 border-t border-white/5"
				>
					{OPS_NAV.map((item) => {
						const isActive = pathname === item.href || (item.href !== "/admin/ops" && pathname?.startsWith(item.href));
						return (
							<Link
								key={item.href}
								href={item.href}
								className={`text-xs font-mono uppercase tracking-wider px-3 py-2 border-b-2 transition-colors ${
									isActive
										? "border-red-400 text-white"
										: "border-transparent text-neutral-400 hover:text-white hover:border-white/20"
								}`}
							>
								{item.label}
							</Link>
						);
					})}
				</nav>
			</header>

			<OpsTokenGate>
				<main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
			</OpsTokenGate>
		</div>
	);
}
