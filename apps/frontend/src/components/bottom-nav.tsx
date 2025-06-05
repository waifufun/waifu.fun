"use client";

import { ChartCandlestick, MessagesSquare, Stars, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
	const pathname = usePathname();
	const mode = pathname === "/" ? "homepage" : pathname?.startsWith("/token/") ? "token" : null;
	const splitted = pathname?.split("/");
	const isTokenIndexPage = mode === "token" ? splitted.length === 5 : false;
	const strippedPath = isTokenIndexPage ? pathname : splitted?.slice(0, -1)?.join("/");

	const LINKS = {
		token: [
			{
				title: "Trades",
				href: `${strippedPath}/#trades`,
				icon: ChartCandlestick,
			},
			{
				title: "Holders",
				href: `${strippedPath}/holders#holders`,
				icon: Users,
			},
			{
				title: "AI Create",
				href: `${strippedPath}/create#create`,
				icon: Stars,
			},
			{
				title: "Chat",
				href: `${strippedPath}/chat#chat`,
				icon: MessagesSquare,
			},
		],
	};

	if (!mode || !LINKS[mode]) return null;

	return (
		<div className="lg:hidden fixed left-0 bottom-0 bg-gradient-to-b from-[#171717] z-[100] via-[#141414] to-[#121212] w-full h-[68px]">
			<div className="grid grid-cols-4 gap-4 h-full">
				{LINKS[mode].map((item) => {
					const Icon = item.icon;
					return (
						<Link href={item.href} className="m-auto cursor-pointer group transition-colors" key={item.title}>
							<div className="flex flex-col items-center">
								<Icon
									size={24}
									className="text-autofun-text-secondary group-hover:text-autofun-text-primary transition-colors duration-200"
								/>
								<span
									className={
										"font-medium text-base text-autofun-text-secondary group-hover:text-autofun-text-primary transition-colors duration-200"
									}
								>
									{item.title}
								</span>
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
