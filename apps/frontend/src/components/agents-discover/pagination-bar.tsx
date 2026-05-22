"use client";

import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function PaginationBar({
	page,
	pageSize,
	total,
}: {
	page: number;
	pageSize: number;
	total: number;
}) {
	const pathname = usePathname() ?? "/agents";
	const searchParams = useSearchParams();

	const hasPrev = page > 0;
	const hasNext = (page + 1) * pageSize < total;

	const buildHref = (targetPage: number) => {
		const params = new URLSearchParams(searchParams?.toString() ?? "");
		if (targetPage <= 0) params.delete("page");
		else params.set("page", String(targetPage));
		const q = params.toString();
		return q ? `${pathname}?${q}` : pathname;
	};

	if (!hasPrev && !hasNext) return null;

	const start = total === 0 ? 0 : page * pageSize + 1;
	const end = Math.min(total, (page + 1) * pageSize);

	return (
		<div className="mt-10 flex items-center justify-between border-t border-white/10 pt-5">
			<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30">
				{start}–{end} of {total}
			</div>
			<div className="flex items-center gap-2">
				<PageLink href={buildHref(page - 1)} disabled={!hasPrev} label="prev" dir="prev" />
				<PageLink href={buildHref(page + 1)} disabled={!hasNext} label="next" dir="next" />
			</div>
		</div>
	);
}

function PageLink({
	href,
	disabled,
	label,
	dir,
}: {
	href: string;
	disabled: boolean;
	label: string;
	dir: "prev" | "next";
}) {
	const content = (
		<>
			{dir === "prev" && <ArrowLeft className="w-3 h-3" strokeWidth={1.75} />}
			{label}
			{dir === "next" && <ArrowRight className="w-3 h-3" strokeWidth={1.75} />}
		</>
	);

	const classes = cn(
		"inline-flex items-center gap-2 h-9 px-4 rounded-sm text-[11px] font-mono uppercase tracking-[0.18em]",
		"border border-white/10 transition-colors",
		disabled ? "text-white/20 cursor-not-allowed" : "text-white/60 hover:text-white hover:border-white/30",
	);

	if (disabled) {
		return <span className={classes}>{content}</span>;
	}
	return (
		<Link href={href} className={classes}>
			{content}
		</Link>
	);
}
