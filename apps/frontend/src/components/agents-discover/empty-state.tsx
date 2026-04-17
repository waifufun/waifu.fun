import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

export default function EmptyState({
	title = "no agents yet.",
	subtitle = "be the first to launch one.",
	ctaHref = "/create",
	ctaLabel = "launch agent",
}: {
	title?: string;
	subtitle?: string;
	ctaHref?: string;
	ctaLabel?: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-24 px-6 border border-dashed border-white/10 rounded-sm bg-[#08080a]">
			<div className="w-10 h-10 rounded-sm border border-white/10 flex items-center justify-center text-white/40 mb-5">
				<Sparkles className="w-4 h-4" strokeWidth={1.5} />
			</div>
			<div className="text-sm text-white/80">{title}</div>
			<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40 mt-2">{subtitle}</div>
			<Link
				href={ctaHref}
				className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono bg-[#22c55e] text-black hover:bg-[#22c55e]/90 transition-colors"
			>
				{ctaLabel}
				<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
			</Link>
		</div>
	);
}
