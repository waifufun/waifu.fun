import { useCallback, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { SidebarMenuButton } from "./ui/sidebar";
import { Label } from "./ui/label";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Select, SelectContent, SelectTrigger, SelectValue } from "./ui/select";

export default function SideBarFilters() {
	const [showFiltersPanel, setShowFiltersPanel] = useState(false);

	const pathname = usePathname();
	const searchParams = useSearchParams();

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
			<Collapsible open={showFiltersPanel} onOpenChange={setShowFiltersPanel}>
				<CollapsibleTrigger
					className="text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24] py-4.5 cursor-pointer"
					asChild
				>
					<SidebarMenuButton
						variant="default"
						className="w-full justify-start group-data-[collapsible=icon]:justify-center"
						size="sm"
						tooltip={{ children: "Filters", side: "left" }}
					>
						<SlidersHorizontal className="h-4 w-4" />
						<span className="text-[14px] uppercase">Filters</span>
						<ChevronDown
							className={cn(
								"ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden",
								showFiltersPanel && "rotate-180",
							)}
						/>
					</SidebarMenuButton>
				</CollapsibleTrigger>

				<CollapsibleContent className="group-data-[collapsible=icon]:hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
					<div className="border-t border-[#03FF24]/20 mt-2" />
					<div className="p-2 space-y-4 mt-4 text-[11px] uppercase font-semibold text-gray-400">
						<div className=" w-full">
							<Label htmlFor="bonding-status-sidebar" className="text-[10px] mb-2 block">
								Token Source
							</Label>
							<Select>
								<SelectTrigger
									id="token-source-sidebar"
									className="w-full bg-black border-2 border-[#03FF24]/80 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] mt-1 h-8"
								>
									<SelectValue placeholder={searchParams.get("origin") || "Select Source"} />
								</SelectTrigger>
								<SelectContent className="bg-black border-2 border-[#03FF24]/80 text-gray-50 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px]">
									{sourceOptions.map((option) => (
										<Link
											className="hover:bg-[#03FF24]/30 focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"
											key={option.value}
											href={`${pathname}?${createQueryString({ origin: option.value })}`}
										>
											{option.label}
										</Link>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label htmlFor="bonding-status-sidebar" className="text-[10px] mb-2 block">
								Status
							</Label>
							<Select>
								<SelectTrigger
									id="token-source-sidebar"
									className="w-full bg-black border-2 border-[#03FF24]/80 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px] mt-1 h-8"
								>
									<SelectValue placeholder={searchParams.get("category") || "Select Source"} />
								</SelectTrigger>
								<SelectContent className="bg-black border-2 border-[#03FF24]/80 text-gray-50 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.45)] uppercase text-[11px]">
									{statusOptions.map((option) => (
										<Link
											className="hover:bg-[#03FF24]/30 focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"
											key={option.value}
											href={`${pathname}?${createQueryString({ category: option.value })}`}
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
