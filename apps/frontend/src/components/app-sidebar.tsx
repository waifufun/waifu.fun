"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type React from "react"; // Removed useRef, useCallback
import { useState } from "react";
import {
	Sidebar,
	SidebarHeader,
	SidebarContent,
	SidebarFooter,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarSeparator,
	// SidebarInput removed
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Twitter,
	Send,
	CreditCard,
	PlusSquare,
	Zap,
	Sparkles,
	Home,
	User,
	Diamond,
	Circle,
	SlidersHorizontal,
	Flame,
	Hourglass,
	Star,
	ChevronDown,
} from "lucide-react";
// import { useAnimation } from "@/contexts/animation-context"
// import { useTokenExplorerFilters, type ExplorerActiveTab } from "@/contexts/token-explorer-filter-context"
import { cn } from "@/lib/utils";
// motion, AnimatePresence removed as search results dropdown is gone from here

const USERNAME_FOR_PROFILE = "funtester22";

// SearchResult interface, mockSearchResults, SearchResultItemComponent removed

const EXPLORER_TABS_CONFIG: { name: ExplorerActiveTab; icon: React.ElementType }[] = [
	{ name: "ALL", icon: Zap },
	{ name: "FEATURED", icon: Star },
	{ name: "HOT NOW", icon: Flame },
	{ name: "NEWEST", icon: Sparkles },
	{ name: "BONDING SOON", icon: Hourglass },
];

export function AppSidebar() {
	const pathname = usePathname();
	const animationLevel = 1;
	//   const { animationLevel } = useAnimation()
	//   const { activeTab, setActiveTab, viewMode, setViewMode, showFiltersPanel, setShowFiltersPanel, filters, setFilters } =
	//     useTokenExplorerFilters()

	const [activeTab, setActiveTab] = useState("");

	const filters = [];

	const isActive = (path: string) => pathname === path;

	// Search related states and effects removed
	// const [searchQuery, setSearchQuery] = useState("")
	// const [searchResults, setSearchResults] = useState<SearchResult[]>([])
	// const [isSearchFocused, setIsSearchFocused] = useState(false)
	// const searchContainerRef = useRef<HTMLDivElement>(null)

	// useEffect for searchQuery and handleClickOutsideSearch removed

	// const showSearchResults = isSearchFocused && searchQuery.length > 0 && searchResults.length > 0; // No longer needed

	const solBalance = 1.83;
	const diamondPoints = 250;
	const circlePoints = 1200;
	const pointsLink = `/profile/${USERNAME_FOR_PROFILE}`;
	const pointsSectionBaseClasses = "flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs";

	const handleFilterChange = (filterName: keyof typeof filters, value: string | boolean) => {
		setFilters((prev) => ({ ...prev, [filterName]: value }));
	};

	const formElementBaseClass =
		"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-xs focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)]";
	const formLabelBaseClass = "text-[10px] text-gray-400 uppercase tracking-wider font-semibold";

	return (
		<Sidebar variant="sidebar" collapsible="icon" side="right">
			<SidebarHeader className="p-2 border-b-2 border-[#03FF24]/40">
				<Link href="/" className="flex items-center gap-2 group">
					<Image
						src="/logo-autofun.png"
						alt="Auto.fun Logo"
						width={36}
						height={36}
						className="pixelated-image-render rounded-none border-2 border-[#03FF24]/50 group-hover:brightness-125 transition-all"
					/>
					<span className="font-['Press_Start_2P',_monospace] text-lg text-[#03FF24] uppercase tracking-tighter group-data-[collapsible=icon]:hidden">
						AUTO.FUN
					</span>
				</Link>
			</SidebarHeader>
			<SidebarContent className="p-2">
				{/* Search input and results dropdown removed from here */}
				{/* Collapsed search icon button removed */}

				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild isActive={isActive("/")} tooltip={{ children: "Home", side: "left" }}>
							<Link href="/">
								<Home /> <span>Home</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							isActive={isActive("/create-token")}
							tooltip={{ children: "Create Token", side: "left" }}
						>
							<Link href="/create-token">
								<PlusSquare /> <span>Create Token</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							isActive={isActive(`/profile/${USERNAME_FOR_PROFILE}`)}
							tooltip={{ children: "Profile", side: "left" }}
						>
							<Link href={`/profile/${USERNAME_FOR_PROFILE}`}>
								<User /> <span>Profile</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<SidebarSeparator />
				<div className="group-data-[collapsible=icon]:hidden">
					<p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Casino Floor</p>
				</div>
				<SidebarMenu>
					{EXPLORER_TABS_CONFIG.map((tab) => (
						<SidebarMenuItem key={tab.name}>
							<SidebarMenuButton
								onClick={() => setActiveTab(tab.name)}
								isActive={activeTab === tab.name}
								tooltip={{ children: tab.name.charAt(0) + tab.name.slice(1).toLowerCase(), side: "left" }}
								size="sm"
							>
								<tab.icon className="h-4 w-4" />
								<span>{tab.name}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>

				<Collapsible open={true}>
					<CollapsibleTrigger asChild>
						<SidebarMenuButton
							variant="ghost"
							className="w-full justify-start group-data-[collapsible=icon]:justify-center"
							size="sm"
							tooltip={{ children: "Filters", side: "left" }}
						>
							<SlidersHorizontal className="h-4 w-4" />
							<span className="group-data-[collapsible=icon]:hidden">Filters</span>
							<ChevronDown
								className={cn(
									"ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden",
									// showFiltersPanel && "rotate-180",
								)}
							/>
						</SidebarMenuButton>
					</CollapsibleTrigger>
					<CollapsibleContent className="group-data-[collapsible=icon]:hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
						<div className="p-2 space-y-3 border-t border-[#03FF24]/20 mt-1">
							<div>
								<Label htmlFor="token-source-sidebar" className={formLabelBaseClass}>
									Source
								</Label>
							</div>
							<div>
								<Label htmlFor="bonding-status-sidebar" className={formLabelBaseClass}>
									Status
								</Label>
								<Select value={filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
									<SelectTrigger
										id="bonding-status-sidebar"
										className={cn(formElementBaseClass, "mt-1 h-8 text-[11px] uppercase")}
									>
										<SelectValue placeholder="Select Status" />
									</SelectTrigger>
									<SelectContent className="bg-black border-2 border-[#03FF24]/80 text-gray-50 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px]">
										<SelectItem value="all" className="focus:bg-[#03FF24]/30 rounded-none">
											All Statuses
										</SelectItem>
										<SelectItem value="inprogress" className="focus:bg-[#03FF24]/30 rounded-none">
											In Progress
										</SelectItem>
										<SelectItem value="bonded" className="focus:bg-[#03FF24]/30 rounded-none">
											Bonded
										</SelectItem>
										<SelectItem value="completed" className="focus:bg-[#03FF24]/30 rounded-none">
											Completed
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center space-x-2 pt-1">
								<Switch
									id="autofun-switch-sidebar"
									checked={filters.autoFunOnly}
									onCheckedChange={(checked) => handleFilterChange("autoFunOnly", checked)}
									className="data-[state=checked]:bg-[#03FF24] rounded-none [&>span]:rounded-none shadow-[1.5px_1.5px_0px_rgba(3,255,36,0.2)] h-4 w-7 [&>span]:h-3 [&>span]:w-3"
								/>
								<Label
									htmlFor="autofun-switch-sidebar"
									className="text-gray-300 cursor-pointer text-[11px] uppercase font-bold tracking-wider"
								>
									Auto.fun Only
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<Switch
									id="inprogress-switch-sidebar"
									checked={filters.liveOnly}
									onCheckedChange={(checked) => handleFilterChange("liveOnly", checked)}
									className="data-[state=checked]:bg-[#03FF24] rounded-none [&>span]:rounded-none shadow-[1.5px_1.5px_0px_rgba(3,255,36,0.2)] h-4 w-7 [&>span]:h-3 [&>span]:w-3"
								/>
								<Label
									htmlFor="inprogress-switch-sidebar"
									className="text-gray-300 cursor-pointer text-[11px] uppercase font-bold tracking-wider"
								>
									Live Only
								</Label>
							</div>
						</div>
					</CollapsibleContent>
				</Collapsible>

				{/* <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setViewMode("grid")}
              isActive={viewMode === "grid"}
              tooltip={{ children: "Grid View", side: "left" }}
              size="sm"
            >
              <Columns className="h-4 w-4" />
              <span>Grid View</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setViewMode("list")}
              isActive={viewMode === "list"}
              tooltip={{ children: "List View", side: "left" }}
              size="sm"
            >
              <Rows className="h-4 w-4" />
              <span>List View</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu> */}

				<SidebarSeparator />

				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip={{ children: "Twitter", side: "left" }}>
							<a href="https://x.com/autofunnetwork" target="_blank" rel="noopener noreferrer">
								<Twitter /> <span>Twitter</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip={{ children: "Telegram", side: "left" }}>
							<a href="https://t.me/autofunnetwork" target="_blank" rel="noopener noreferrer">
								<Send /> <span>Telegram</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarContent>
			<SidebarFooter className="p-2 border-t-2 border-[#03FF24]/40">
				<div className="p-2 space-y-1 group-data-[collapsible=icon]:hidden text-gray-300">
					<Link href={pointsLink} passHref>
						<span className={cn(pointsSectionBaseClasses, "justify-between")} title={`SOL Balance: ${solBalance}`}>
							<span>
								{solBalance.toFixed(2)}{" "}
								<span
									className={cn("text-[#03FF24] font-semibold ml-1", animationLevel >= 1 && "animate-subtle-flicker")}
								>
									SOL
								</span>
							</span>
							<Image
								src="/solana-logo.png"
								alt="SOL"
								width={14}
								height={14}
								className="pixelated-image-render opacity-70"
							/>
						</span>
					</Link>
					<Link href={pointsLink} passHref legacyBehavior>
						<a className={cn(pointsSectionBaseClasses, "justify-between")} title={`Permanent Points: ${diamondPoints}`}>
							<span>
								<span className="font-semibold text-yellow-400">{diamondPoints}</span> <span className="ml-1">PP</span>
							</span>
							<Diamond size={14} className="text-yellow-400" />
						</a>
					</Link>
					<Link href={pointsLink} passHref legacyBehavior>
						<a className={cn(pointsSectionBaseClasses, "justify-between")} title={`Weekly Points: ${circlePoints}`}>
							<span>
								<span className="font-semibold text-gray-300">{circlePoints}</span> <span className="ml-1">WP</span>
							</span>
							<Circle size={14} className="text-gray-400 fill-current" />
						</a>
					</Link>
				</div>
				<div className="group-data-[collapsible=icon]:block hidden">
					<SidebarMenuButton tooltip={{ children: `SOL: ${solBalance.toFixed(2)}`, side: "left" }} asChild>
						<Link href={pointsLink}>
							<Image
								src="/crypto-icons/solana.png"
								alt="SOL"
								width={20}
								height={20}
								className="pixelated-image-render"
							/>
							<span className="sr-only">SOL Balance</span>
						</Link>
					</SidebarMenuButton>
				</div>

				<SidebarMenu>
					<SidebarMenuItem>
						<Button
							variant="default"
							className={cn(
								"w-full flex items-center justify-center gap-2 overflow-hidden rounded-none p-2 text-left text-sm outline-none ring-[#03FF24] transition-all focus-visible:ring-1 active:bg-[#02c71e]",
								"bg-[#03FF24] text-black hover:bg-[#02e020] font-bold h-10",
								"group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-2",
								"shadow-[3px_3px_0px_#01a718] hover:shadow-[1px_1px_0px_#01a718] active:shadow-none hover:-translate-x-px hover:-translate-translate-y-px active:translate-x-0 active:translate-y-0",
								animationLevel > 0 && "animate-button-pop-hover",
							)}
							title="Connect Wallet"
						>
							<CreditCard className="h-5 w-5 shrink-0" />
							<span className="truncate group-data-[collapsible=icon]:hidden">Connect Wallet</span>
						</Button>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
