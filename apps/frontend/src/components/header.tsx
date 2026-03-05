"use client";

import Link from "next/link";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";
import { Button } from "./ui/button";
import { Rocket } from "lucide-react";

export default function Header() {
	return (
		<div className="shrink-0 w-full sticky top-0 z-50">
			{/* Glassmorphism header */}
			<div
				className="w-full h-[68px] flex items-center justify-between gap-4 px-4 sm:px-6 bg-[#0a0a0a]/70 backdrop-blur-xl border-b border-white/[0.04]"
			>
				<div className="flex items-center gap-4 min-w-0 flex-1">
					<Link
						href="/"
						className="shrink-0 font-bold text-xl sm:text-2xl tracking-tight text-white hover:text-[#E8762D] transition-colors"
						aria-label="waifu.fun home"
					>
						<span className="text-[#E8762D]">WAIFU</span>
						<span className="text-white/80">.FUN</span>
					</Link>

					{/* Nav links */}
					<nav className="hidden md:flex items-center gap-1 ml-2">
						<Link
							href="/explore"
							className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.04]"
						>
							Explore
						</Link>
					</nav>

					<div className="flex-1 max-w-sm ml-2">
						<SearchMenu />
					</div>
				</div>

				<div className="flex items-center gap-3 shrink-0 ml-auto">
					<Link href="/create">
						<Button
							size="sm"
							className="bg-[#E8762D] text-white hover:bg-[#E8762D]/90 hover:text-white font-semibold gap-1.5 rounded-lg shadow-[0_0_16px_rgba(232,118,45,0.25)] hover:shadow-[0_0_24px_rgba(232,118,45,0.4)] transition-all"
						>
							<Rocket className="size-3.5" />
							<span className="hidden sm:inline">Launch Agent</span>
							<span className="sm:hidden">Launch</span>
						</Button>
					</Link>
					<HeaderConnectWallet />
				</div>
			</div>

			{/* Pink accent line */}
			<div className="h-px bg-gradient-to-r from-transparent via-[#E8762D]/50 to-transparent" />
		</div>
	);
}
