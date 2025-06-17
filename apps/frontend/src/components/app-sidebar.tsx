"use client";

import type { ComponentProps } from "react";
import { Filter } from "lucide-react";
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
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";
import GridListSelector from "./grid-list-selector";
import FilterSelector from "./filter-selector";

const viewControlsNavigation = {
	items: [{ title: "FILTERS", url: "/casino/filters", icon: Filter, hasDropdown: true }],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const address = useAddress();
	const balance = useBalance({
		address,
		chain: "solana",
	});

	return (
		<Sidebar collapsible="icon" side="right" {...props}>
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1">
					<Link href="/" className="flex items-center gap-2">
						<Image src="/logo_wide.svg" height={32} width={100} className="h-8 w-auto" unoptimized alt="Auto.Fun" />
					</Link>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>CASINO FLOOR</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<FilterSelector />
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<GridListSelector />
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
			</SidebarContent>
			<SidebarFooter>
				<SidebarSeparator />
				<div className="space-y-1 p-3 text-xs">
					{balance?.data ? (
						<div className="flex items-center justify-between text-white">
							<span>{balance?.data}</span>
							<span className="font-medium text-green-400">SOL</span>
						</div>
					) : null}
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
