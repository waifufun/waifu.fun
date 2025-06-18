import { useCallback, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { SidebarMenuButton } from "./ui/sidebar";
import { Label } from "./ui/label";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SideBarFilters() {
	const [showFiltersPanel, setShowFiltersPanel] = useState(false);

	const pathname = usePathname();
	const searchParams = useSearchParams();

	const createQueryString = useCallback(
		(params: Record<string, string>) => {
			const urlParams = new URLSearchParams(searchParams.toString());

			for (const [key, value] of Object.entries(params)) {
				if (value === "all") {
					urlParams.delete(key); // Clear from URL
				} else {
					urlParams.set(key, value);
				}
			}
			return urlParams.toString();
		},
		[searchParams],
	);

	const sourceOptions = [
		{ label: "All Sources", value: "all" },
		{ label: "Auto.fun", value: "auto-fun" },
		{ label: "Community", value: "community" },
	];

	const statusOptions = [
		{ label: "All Statuses", value: "all" },
		{ label: "In Progress", value: "in-progress" },
		{ label: "Bonded", value: "bonded" },
		{ label: "Completed", value: "completed" },
	];

	return (
		<Collapsible open={showFiltersPanel} onOpenChange={setShowFiltersPanel}>
			<CollapsibleTrigger asChild>
				<SidebarMenuButton
					variant="default"
					className="w-full justify-start group-data-[collapsible=icon]:justify-center"
					size="sm"
					tooltip={{ children: "Filters", side: "left" }}
				>
					<SlidersHorizontal className="h-4 w-4" />
					<span className="group-data-[collapsible=icon]:hidden">Filters</span>
					<ChevronDown
						className={cn(
							"ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden",
							showFiltersPanel && "rotate-180",
						)}
					/>
				</SidebarMenuButton>
			</CollapsibleTrigger>

			<CollapsibleContent className="group-data-[collapsible=icon]:hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
				<div className="p-2 space-y-3 border-t border-[#03FF24]/20 mt-1 text-[11px] uppercase font-semibold text-gray-400">
					{/* Source filter */}
					<div>
						<Label htmlFor="token-source-sidebar" className="text-[10px] mb-1 block">
							Source
						</Label>
						<div className="flex flex-col gap-1">
							{sourceOptions.map((option) => (
								<Link
									key={option.value}
									href={`${pathname}?${createQueryString({ source: option.value })}`}
									className="px-2 py-1 hover:bg-[#03FF24]/30 transition rounded-sm"
								>
									{option.label}
								</Link>
							))}
						</div>
					</div>

					{/* Status filter */}
					<div>
						<Label htmlFor="bonding-status-sidebar" className="text-[10px] mb-1 block">
							Status
						</Label>
						<div className="flex flex-col gap-1">
							{statusOptions.map((option) => (
								<Link
									key={option.value}
									href={`${pathname}?${createQueryString({ status: option.value })}`}
									className="px-2 py-1 hover:bg-[#03FF24]/30 transition rounded-sm"
								>
									{option.label}
								</Link>
							))}
						</div>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
