"use client";

import Link from "next/link";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";

export default function Header() {
	return (
		<div className="shrink-0 w-full bg-transparent">
			<div
				className="w-full h-[68px] flex items-center justify-between gap-4 px-4"
				style={{ background: "transparent" }}
			>
				<div className="flex items-center gap-4 min-w-0 flex-1">
					<Link
						href="/"
						className="shrink-0 font-bold text-xl sm:text-2xl tracking-tight text-[#2563eb] hover:text-[#3b82f6] transition-colors"
						aria-label="waifu.fun home"
					>
						WAIFU.FUN
					</Link>
					<SearchMenu />
				</div>
				<div className="flex items-center shrink-0 ml-auto">
					<HeaderConnectWallet />
				</div>
			</div>
		</div>
	);
}
