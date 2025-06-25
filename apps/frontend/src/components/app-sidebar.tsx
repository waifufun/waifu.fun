"use client";

import type { ComponentProps } from "react";
import { Filter } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { formatNumber } from "@/lib/utils";

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
	useSidebar,
} from "@/components/ui/sidebar";
import ConnectWallet from "@/components/connect-wallet";
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";
import GridListSelector from "./grid-list-selector";
import FilterSelector from "./filter-selector";
import SideBarFilters from "./sidebar-filters";
import { Button } from "./ui/button";

const viewControlsNavigation = {
	items: [{ title: "FILTERS", url: "/casino/filters", icon: Filter, hasDropdown: true }],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const address = useAddress();
	const { state } = useSidebar();
	const balance = useBalance({
		address,
		chain: "solana",
	});

	const tokenPage = pathname.startsWith("/token");
	const isCollapsed = state === "collapsed";

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
				{!tokenPage && (
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								<GridListSelector />
								<SidebarMenuItem>
									<SidebarMenuButton asChild>
										<SideBarFilters />
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
			<SidebarFooter>
				{!isCollapsed && (
					<div className="space-y-1 p-3 text-xs">
						{balance?.data ? (
							<div className="flex items-center justify-between text-white">
								<span>{formatNumber(balance?.data, true, true)}</span>
								<span className="font-medium text-green-400">SOL</span>
							</div>
						) : null}
					</div>
				)}
				{!isCollapsed && (
					<div className="flex items-center justify-center gap-2.5">
						<div className="gap-2.5 w-full">
							<Link href="/create" className="w-full">
								<Button className="h-10 px-4 py-5 w-full" variant="outline">
									Create Token
								</Button>
							</Link>
						</div>
					</div>
				)}
				<ConnectWallet />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
