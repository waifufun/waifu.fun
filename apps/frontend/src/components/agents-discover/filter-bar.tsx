"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSort, AgentStatusFilter } from "./types";

const STATUS_TABS: { key: AgentStatusFilter; label: string }[] = [
	{ key: "all", label: "all" },
	{ key: "active", label: "active" },
	{ key: "graduated", label: "graduated" },
];

const SORTS: { key: AgentSort; label: string }[] = [
	{ key: "newest", label: "newest" },
	{ key: "volume_24h", label: "volume 24h" },
	{ key: "market_cap", label: "market cap" },
];

export default function FilterBar({
	status,
	sort,
}: {
	status: AgentStatusFilter;
	sort: AgentSort;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const updateParam = useCallback(
		(key: string, value: string | null) => {
			const params = new URLSearchParams(searchParams.toString());
			if (value === null || value === "") {
				params.delete(key);
			} else {
				params.set(key, value);
			}
			// reset pagination on filter change
			params.delete("page");
			const query = params.toString();
			router.push(query ? `${pathname}?${query}` : pathname);
		},
		[pathname, router, searchParams],
	);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3">
			{/* status tabs */}
			<div className="inline-flex items-center gap-0 border border-white/10 rounded-sm bg-[#08080a] p-1">
				{STATUS_TABS.map((tab) => {
					const active = status === tab.key;
					return (
						<button
							key={tab.key}
							type="button"
							onClick={() => updateParam("status", tab.key === "all" ? null : tab.key)}
							className={cn(
								"h-7 px-3 text-[11px] font-mono uppercase tracking-[0.18em] rounded-sm transition-colors",
								active ? "bg-[#22c55e] text-black" : "text-white/50 hover:text-white",
							)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* sort dropdown */}
			<SortDropdown value={sort} onChange={(value) => updateParam("sort", value === "newest" ? null : value)} />
		</div>
	);
}

function SortDropdown({
	value,
	onChange,
}: {
	value: AgentSort;
	onChange: (value: AgentSort) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		};
		if (open) {
			document.addEventListener("mousedown", handler);
			return () => document.removeEventListener("mousedown", handler);
		}
		return undefined;
	}, [open]);

	const current = SORTS.find((s) => s.key === value) ?? SORTS[0];

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"inline-flex items-center gap-2 h-8 px-3 rounded-sm text-[11px] font-mono uppercase tracking-[0.18em]",
					"border border-white/10 bg-[#08080a] text-white/70 hover:text-white hover:border-white/25 transition-colors",
				)}
			>
				<span className="text-white/40">sort:</span>
				<span>{current?.label}</span>
				<ChevronDown
					className={cn("w-3 h-3 transition-transform duration-200", open && "rotate-180")}
					strokeWidth={1.75}
				/>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] border border-white/10 bg-[#08080a] rounded-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1">
					{SORTS.map((s) => {
						const active = s.key === value;
						return (
							<button
								key={s.key}
								type="button"
								onClick={() => {
									onChange(s.key);
									setOpen(false);
								}}
								className={cn(
									"w-full flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.18em]",
									"transition-colors",
									active ? "text-[#22c55e]" : "text-white/60 hover:text-white hover:bg-white/[0.03]",
								)}
							>
								<span>{s.label}</span>
								{active && <Check className="w-3 h-3" strokeWidth={2} />}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
