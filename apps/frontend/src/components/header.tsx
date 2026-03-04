"use client";

import Link from "next/link";
import Image from "next/image";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";

export default function Header() {
	return (
		<div className="shrink-0 w-full">
			<div className="w-full h-[68px] flex items-center justify-between gap-4 px-4">
				<div className="flex items-center gap-4 min-w-0 flex-1">
					<Link href="/" className="shrink-0">
						<Image src="/logo_wide.svg" height={44} width={88} className="h-11 w-auto" unoptimized alt="logo" />
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
