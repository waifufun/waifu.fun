// Generic empty-state primitive used across the app.
//
// Keeps the visual language consistent with `agents-discover/empty-state`
// (the version that ships on the landing page): dashed border, mono label,
// optional icon, optional CTA.
//
// Use this anywhere a list/section can legitimately be empty.

"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { ArrowRight, type LucideIcon, Sparkles } from "lucide-react";
import Link from "next/link";

type EmptyStateProps = {
	title?: string;
	body?: string;
	icon?: LucideIcon;
	ctaHref?: string;
	ctaLabel?: string;
	onCta?: () => void;
	tone?: "default" | "compact";
	className?: string;
};

export function EmptyState({
	title,
	body,
	icon: Icon = Sparkles,
	ctaHref,
	ctaLabel,
	onCta,
	tone = "default",
	className,
}: EmptyStateProps) {
	const { t } = useTranslation();
	const compact = tone === "compact";
	const resolvedTitle = title ?? t("common.emptyState.title");
	const resolvedCtaLabel = ctaLabel ?? t("common.emptyState.ctaDefault");
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-sm bg-[#08080a]",
				compact ? "py-10 px-6" : "py-20 px-6 md:py-24",
				className,
			)}
		>
			<div
				className={cn(
					"rounded-sm border border-white/10 flex items-center justify-center text-white/40",
					compact ? "w-8 h-8 mb-3" : "w-10 h-10 mb-5",
				)}
			>
				<Icon className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} strokeWidth={1.5} />
			</div>
			<div className={cn("text-white/85", compact ? "text-sm" : "text-sm md:text-base")}>{resolvedTitle}</div>
			{body ? (
				<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40 mt-2 max-w-sm">{body}</div>
			) : null}
			{ctaHref || onCta ? (
				<EmptyStateCta
					{...(ctaHref ? { href: ctaHref } : {})}
					label={resolvedCtaLabel}
					{...(onCta ? { onClick: onCta } : {})}
				/>
			) : null}
		</div>
	);
}

function EmptyStateCta({ href, label, onClick }: { href?: string; label: string; onClick?: () => void }) {
	const className =
		"mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono bg-[#00ff87] text-black hover:bg-[#00ff87]/90 transition-colors";
	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={className}>
				{label}
				<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
			</button>
		);
	}
	if (href) {
		return (
			<Link href={href} className={className}>
				{label}
				<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
			</Link>
		);
	}
	return null;
}

export default EmptyState;
