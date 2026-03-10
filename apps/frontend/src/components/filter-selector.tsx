"use client";
import { Fragment, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";
import Link from "next/link";
import { ChartBar, Flame, Sparkles, Zap } from "lucide-react";
import type { DiscoverySort } from "@/lib/discovery-params";
import { DEFAULT_SORT } from "@/lib/discovery-params";

/**
 * Sort options aligned with the backend discovery contract.
 *
 * sort = trending | new | marketCap
 *
 * "ALL" resets the sort param (falls back to DEFAULT_SORT on the grid).
 */
const items: { title: string; sort: DiscoverySort | null; icon: typeof Zap }[] = [
	{ title: "ALL", sort: null, icon: Zap },
	{ title: "TRENDING", sort: "trending", icon: Flame },
	{ title: "NEWEST", sort: "new", icon: Sparkles },
	{ title: "MARKET CAP", sort: "marketCap", icon: ChartBar },
];

export default function FilterSelector() {
	const searchParams = useSearchParams();

	const createQueryString = useCallback(
		(params: Record<string, string | null>) => {
			const urlParams = new URLSearchParams(searchParams.toString());

			for (const [name, value] of Object.entries(params)) {
				if (value) {
					urlParams.set(name, value);
				} else {
					urlParams.delete(name);
				}
			}

			return urlParams.toString();
		},
		[searchParams],
	);

	const currentSort = searchParams.get("sort");
	const activeSort = currentSort ?? DEFAULT_SORT;

	return (
		<Fragment>
			{items.map((item) => {
				const isActive = item.sort === null ? !currentSort || currentSort === DEFAULT_SORT : activeSort === item.sort;

				return (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							asChild
							isActive={isActive}
							tooltip={item.title}
							className={
								isActive
									? "bg-autofun-background-action-highlight/20"
									: "text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24]"
							}
						>
							<Link href={item.sort ? `/?${createQueryString({ sort: item.sort })}` : "/"}>
								<item.icon className="h-4 w-4" />
								<span>{item.title}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</Fragment>
	);
}
