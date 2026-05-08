"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = {
	title: string;
	subtitle?: string | undefined;
	backHref?: string | undefined;
};

export default function PatronHeader({ title, subtitle, backHref }: Props) {
	return (
		<header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6 pb-4 border-b border-stroke-strong">
			<div className="flex flex-col gap-1">
				{backHref ? (
					<Link href={backHref} className="text-xs uppercase tracking-wide text-neutral-400 hover:text-white w-fit">
						&larr; Back
					</Link>
				) : null}
				<h1 className="text-2xl md:text-3xl font-medium text-white leading-tight">{title}</h1>
				{subtitle ? <p className="text-sm text-neutral-400">{subtitle}</p> : null}
			</div>
			<div className="flex items-center gap-3">
				<Link
					href="/patron/portfolio"
					className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors"
				>
					portfolio
				</Link>
				<Link
					href="/patron/wallets"
					className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors"
				>
					wallets
				</Link>
				<Link href="/create/wizard">
					<Button variant="outline" className="h-9 px-4">
						Create agent
					</Button>
				</Link>
			</div>
		</header>
	);
}
