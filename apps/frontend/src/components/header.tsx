"use client";
import Link from "next/link";
import { Button } from "./ui/button";
import Image from "next/image";
import SearchMenu from "./search-menu";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { SidebarTrigger, useSidebar } from "./ui/sidebar";

export default function Header() {
	const { open } = useSidebar();

	return (
		<div className="bg-[#08080A] px-4 border-b-2 border-waifu-green/30">
			<div className="container h-[68px] flex items-center gap-4 justify-between">
				<div className="flex items-center gap-4">
					<Link href="/" className="shrink-0 grow">
						<Image
							src="/brand/lockup/lockup_waifu_512.png"
							height={40}
							width={160}
							className="h-10 w-auto"
							unoptimized
							alt="waifu.fun"
						/>
					</Link>
					<SearchMenu />
					{/* Social Icons */}
					<div className={cn("flex items-center gap-1.5", open ? "xl:flex" : "lg:flex")}>
						{[
							{
								title: "twitter",
								href: "https://x.com/waifu_fun",
								icon: "/socials/twitter.svg",
							},
							{
								title: "telegram",
								href: "https://t.me/waifufun_official",
								icon: "/socials/telegram.svg",
							},
						].map((social) => {
							const hasLink = !!social?.href;
							const Comp = hasLink ? Link : Fragment;

							const compProps: { key: string; href?: string; target?: string } = {
								key: social.title,
							};

							if (hasLink && social.href) {
								compProps.href = social.href;
								compProps.target = "_blank";
							}

							return (
								// @ts-ignore
								<Comp {...compProps} key={social.title}>
									<Image
										src={social.icon}
										className={cn([
											"size-6 select-none inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-background h-7 w-7 p-1 border-2 border-[#00FF87]/50 text-[#00FF87]/80 hover:text-[#00FF87] hover:bg-[#00FF87]/10 hover:border-[#00FF87] rounded-none shadow-[2px_2px_0px_rgba(0,255,135,0.2)] opacity-50 cursor-not-allowed",
											!social?.href ? "opacity-50 cursor-not-allowed" : "opacity-100 cursor-pointer",
										])}
										unoptimized
										width={24}
										height={24}
										alt={social.title}
									/>
								</Comp>
							);
						})}
					</div>
				</div>
				<div className="flex items-center gap-2.5">
					<div className="hidden lg:flex gap-2.5">
						<Link href="/create">
							<Button className="h-10 px-4 py-2" variant="outline">
								Create Waifu
							</Button>
						</Link>
					</div>
					<SidebarTrigger />
				</div>
			</div>
		</div>
	);
}
