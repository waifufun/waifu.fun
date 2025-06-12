"use client";

import type { ComponentProps } from "react";
import { Zap, Star, Flame, Sparkles, Hourglass, Filter, LayoutGrid, List, ChevronDown } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import ConnectWallet from "@/components/connect-wallet";

const casinoFloorNavigation = {
	title: "CASINO FLOOR",
	items: [
		{ title: "ALL", url: "/casino/all", icon: Zap },
		{ title: "FEATURED", url: "/casino/featured", icon: Star },
		{ title: "HOT NOW", url: "/casino/hot-now", icon: Flame },
		{ title: "NEWEST", url: "/casino/newest", icon: Sparkles },
		{ title: "BONDING SOON", url: "/casino/bonding-soon", icon: Hourglass },
	],
};

const viewControlsNavigation = {
	items: [
		{ title: "Filters", url: "/casino/filters", icon: Filter, hasDropdown: true },
		{ title: "Grid View", url: "/casino/view/grid", icon: LayoutGrid },
		{ title: "List View", url: "/casino/view/list", icon: List },
	],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();

	return (
		<Sidebar collapsible="icon" side="left" {...props}>
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1">
					<Link href="/" className="flex items-center gap-2">
						<Image src="/logo_wide.svg" height={32} width={100} className="h-8 w-auto" unoptimized alt="Auto.Fun" />
					</Link>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{casinoFloorNavigation.title}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{casinoFloorNavigation.items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.url}
										tooltip={item.title}
										className={
											pathname === item.url
												? "bg-autofun-background-action-highlight/20"
												: "text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24]"
										}
									>
										<Link href={item.url}>
											<item.icon className="h-4 w-4" />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{viewControlsNavigation.items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.url}
										tooltip={item.title}
										className={
											pathname === item.url
												? "bg-autofun-background-action-highlight/20"
												: "text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24]"
										}
									>
										<Link href={item.url} className="flex w-full items-center justify-between">
											<div className="flex items-center gap-2">
												<item.icon className="h-4 w-4" />
												<span>{item.title}</span>
											</div>
											{item.hasDropdown && <ChevronDown className="h-4 w-4 opacity-70" />}
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarSeparator />
				<div className="space-y-1 p-3 text-xs">
					<div className="flex items-center justify-between text-white">
						<span>1.83</span>
						<span className="font-medium text-green-400">SOL</span>
					</div>
					<div className="flex items-center justify-between text-white">
						<span>250</span>
						<span className="font-medium text-yellow-400">PP</span>
					</div>
					<div className="flex items-center justify-between text-white">
						<span>1200</span>
						<span className="font-medium text-gray-400">WP</span>
					</div>
				</div>
				<ConnectWallet />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
