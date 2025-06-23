import { useCallback, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { SidebarMenuButton, useSidebar } from "./ui/sidebar";
import { Label } from "./ui/label";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Select, SelectContent, SelectTrigger, SelectValue } from "./ui/select";

export default function SideBarFilters() {
	const [showFiltersPanel, setShowFiltersPanel] = useState(false);
	const [sourceOpen, setSourceOpen] = useState(false);
	const [statusOpen, setStatusOpen] = useState(false);

	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { state } = useSidebar();
	const isCollapsed = state === "collapsed";

	const createQueryString = useCallback(
		(params: Record<string, string>) => {
			const urlParams = new URLSearchParams(searchParams.toString());

			for (const [key, value] of Object.entries(params)) {
				if (value === "all") {
					urlParams.delete(key);
				} else {
					urlParams.set(key, value);
				}
			}
			return urlParams.toString();
		},
		[searchParams],
	);

	const sourceOptions = [
		{ label: "All", value: "all" },
		{ label: "Auto.fun", value: "auto-fun" },
		{ label: "Imported", value: "imported" },
	];

	const statusOptions = [
		{ label: "All", value: "all" },
		{ label: "About to bond", value: "about-to-bond" },
		{ label: "Bonded", value: "bonded" },
	];

	return (
		<>
			<Collapsible open={showFiltersPanel && !isCollapsed} onOpenChange={setShowFiltersPanel}>
				<CollapsibleTrigger
					className={cn(
						"text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24] py-4.5 cursor-pointer transition-all duration-200",
						isCollapsed && "absolute left-0 top-0 w-full h-full",
					)}
					asChild
				>
					<SidebarMenuButton
						variant="default"
						className={cn("w-full transition-all duration-200")}
						size="sm"
						tooltip={{ children: "Filters", side: "left" }}
					>
						<SlidersHorizontal className={cn("h-4 w-4 transition-all duration-200")} />
						<span className={cn("text-[14px] uppercase transition-all duration-200", isCollapsed && "hidden")}>
							Filters
						</span>
						<ChevronDown
							className={cn(
								"ml-auto h-4 w-4 transition-all duration-200",
								showFiltersPanel && "rotate-180",
								isCollapsed && "hidden",
							)}
						/>
					</SidebarMenuButton>
				</CollapsibleTrigger>

				<CollapsibleContent
					className={cn(
						"data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden transition-all duration-300",
						isCollapsed && "hidden",
					)}
				>
					<div className="border-t border-[#03FF24]/20 mt-2 transition-opacity duration-200" />
					<div className="p-2 space-y-4 mt-4 text-[11px] uppercase font-semibold text-gray-400">
						<div className="w-full">
							<Label htmlFor="token-source-sidebar" className="text-[10px] mb-2 block transition-colors duration-200">
								Token Source
							</Label>
							<Select open={sourceOpen} onOpenChange={setSourceOpen}>
								<SelectTrigger
									id="token-source-sidebar"
									className="w-full bg-black border-2 border-[#03FF24]/80 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] mt-1 h-8 transition-all duration-200 hover:border-[#03FF24] hover:shadow-[4px_4px_0px_rgba(3,255,36,0.6)]"
								>
									<SelectValue placeholder={searchParams.get("origin") || "Select Source"} />
								</SelectTrigger>
								<SelectContent className="bg-black border-2 border-[#03FF24]/80 text-gray-50 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] animate-in fade-in-0 zoom-in-95">
									{sourceOptions.map((option) => (
										<Link
											className={cn(
												"hover:bg-[#03FF24]/30 focus:bg-accent focus:text-accent-foreground",
												"[&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
												"data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
												"*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
												"transition-all duration-150 hover:translate-x-1",
											)}
											key={option.value}
											href={`${pathname}?${createQueryString({ origin: option.value })}`}
											onClick={() => setSourceOpen(false)}
										>
											{option.label}
										</Link>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label htmlFor="status-sidebar" className="text-[10px] mb-2 block transition-colors duration-200">
								Status
							</Label>
							<Select open={statusOpen} onOpenChange={setStatusOpen}>
								<SelectTrigger
									id="status-sidebar"
									className="w-full bg-black border-2 border-[#03FF24]/80 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] mt-1 h-8 transition-all duration-200 hover:border-[#03FF24] hover:shadow-[4px_4px_0px_rgba(3,255,36,0.6)]"
								>
									<SelectValue placeholder={searchParams.get("category") || "Select Status"} />
								</SelectTrigger>
								<SelectContent className="bg-black border-2 border-[#03FF24]/80 text-gray-50 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] animate-in fade-in-0 zoom-in-95">
									{statusOptions.map((option) => (
										<Link
											className={cn(
												"hover:bg-[#03FF24]/30 focus:bg-accent focus:text-accent-foreground",
												"[&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
												"data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
												"*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
												"transition-all duration-150 hover:translate-x-1",
											)}
											key={option.value}
											href={`${pathname}?${createQueryString({ category: option.value })}`}
											onClick={() => setStatusOpen(false)}
										>
											{option.label}
										</Link>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</>
	);
}
