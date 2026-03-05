"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

const filters = [
	{ label: "All", value: "all" },
	{ label: "Trading", value: "trading" },
	{ label: "Creative", value: "creative" },
	{ label: "New", value: "new" },
	{ label: "Top Performers", value: "top" },
];

export function ExploreFilters() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const currentFilter = searchParams.get("filter") || "all";

	const setFilter = useCallback(
		(value: string) => {
			const params = new URLSearchParams(searchParams.toString());
			if (value === "all") {
				params.delete("filter");
			} else {
				params.set("filter", value);
			}
			const qs = params.toString();
			router.push(qs ? `${pathname}?${qs}` : pathname);
		},
		[searchParams, router, pathname]
	);

	return (
		<div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
			{filters.map((f) => {
				const isActive = f.value === currentFilter;
				return (
					<button
						key={f.value}
						onClick={() => setFilter(f.value)}
						className={cn(
							"shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
							isActive
								? "bg-[#E8762D] text-white border-[#E8762D] shadow-[0_0_12px_rgba(255,45,120,0.3)]"
								: "bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white hover:border-white/[0.12] hover:bg-white/[0.08]"
						)}
					>
						{f.label}
					</button>
				);
			})}
		</div>
	);
}
