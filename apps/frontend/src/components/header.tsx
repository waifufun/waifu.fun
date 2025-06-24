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
		<div className="bg-black px-4 border-b-2 border-autofun-background-action-highlight/50">
			<div className="container h-[68px] flex items-center gap-4 justify-between">
				<div className="flex items-center gap-4">
					<Link href="/" className="shrink-0 grow">
						<Image src="/logo_wide.svg" height={44} width={88} className="h-11 w-auto" unoptimized alt="logo" />
					</Link>
					<SearchMenu />
					{/* Social Icons */}
					<div className={cn("hidden items-center gap-6", open ? "xl:flex" : "lg:flex")}>
						{[
							{
								title: "twitter",
								href: "https://x.com/autodotfun",
								icon: "/socials/twitter.svg",
							},
							{
								title: "discord",
								href: "https://discord.gg/ai16z",
								icon: "/socials/discord.svg",
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
											"size-6 select-none",
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
								Create Token
							</Button>
						</Link>
					</div>
					<SidebarTrigger />
				</div>
			</div>
		</div>
	);
}
