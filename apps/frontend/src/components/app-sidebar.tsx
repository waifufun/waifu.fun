"use client";

import type { ComponentProps } from "react";
import { Home, Plus, Search, TrendingUp, User, Settings, Trophy, BarChart3, Coins, Activity } from "lucide-react";
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
} from "@/components/ui/sidebar";
import ConnectWallet from "@/components/connect-wallet";
import useAddress from "@/hooks/use-address";

const navigation = [
	{
		title: "Overview",
		items: [
			{
				title: "Home",
				url: "/",
				icon: Home,
			},
			{
				title: "Trending",
				url: "/trending",
				icon: TrendingUp,
			},
			{
				title: "Analytics",
				url: "/analytics",
				icon: BarChart3,
			},
		],
	},
	{
		title: "Trading",
		items: [
			{
				title: "All Tokens",
				url: "/tokens",
				icon: Coins,
			},
			{
				title: "Activity",
				url: "/activity",
				icon: Activity,
			},
		],
	},
	{
		title: "Create",
		items: [
			{
				title: "Create Token",
				url: "/create",
				icon: Plus,
			},
			{
				title: "Import Token",
				url: "/create/import",
				icon: Search,
			},
		],
	},
];

const userNavigation = [
	{
		title: "Profile",
		url: "/profile",
		icon: User,
	},
	{
		title: "Leaderboard",
		url: "/leaderboard",
		icon: Trophy,
	},
	{
		title: "Settings",
		url: "/settings",
		icon: Settings,
	},
];

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const address = useAddress();

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1">
					<Link href="/" className="flex items-center gap-2">
						<Image src="/logo_wide.svg" height={32} width={64} className="h-8 w-auto" unoptimized alt="Auto.Fun" />
					</Link>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{navigation.map((group) => (
					<SidebarGroup key={group.title}>
						<SidebarGroupLabel>{group.title}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
											<Link href={item.url}>
												<item.icon />
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}

				{address && (
					<SidebarGroup>
						<SidebarGroupLabel>Account</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{userNavigation.map((item) => (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton asChild isActive={pathname.startsWith(item.url)} tooltip={item.title}>
											<Link href={`${item.url}${item.url === "/profile" ? `/${address}` : ""}`}>
												<item.icon />
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex flex-col gap-2 p-2">
							<ConnectWallet />
							{!address && (
								<div className="text-xs text-muted-foreground text-center">
									Connect your wallet to access all features
								</div>
							)}
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
