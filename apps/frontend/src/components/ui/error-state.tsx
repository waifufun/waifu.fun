// Generic error-state primitive.
//
// Replaces the bespoke red-tinted divs scattered across the app. Always
// gives the user something to do (retry, go home, contact support).

"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

type ErrorStateProps = {
	title?: string;
	message?: string;
	onRetry?: () => void;
	retryLabel?: string;
	homeHref?: string;
	tone?: "default" | "compact";
	className?: string;
};

export function ErrorState({
	title,
	message,
	onRetry,
	retryLabel,
	homeHref,
	tone = "default",
	className,
}: ErrorStateProps) {
	const { t } = useTranslation();
	const compact = tone === "compact";
	const resolvedTitle = title ?? t("common.errorState.title");
	const resolvedRetryLabel = retryLabel ?? t("common.errorState.tryAgain");
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center border border-red-500/25 rounded-sm bg-red-500/[0.02]",
				compact ? "py-8 px-5" : "py-16 px-6 md:py-20",
				className,
			)}
			role="alert"
		>
			<div
				className={cn(
					"rounded-sm border border-red-500/30 flex items-center justify-center text-red-300/80",
					compact ? "w-8 h-8 mb-3" : "w-10 h-10 mb-5",
				)}
			>
				<AlertTriangle className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} strokeWidth={1.5} />
			</div>
			<div className={cn("text-red-200/90", compact ? "text-sm" : "text-sm md:text-base")}>{resolvedTitle}</div>
			{message ? (
				<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-red-300/55 mt-2 max-w-sm break-words">
					{message}
				</div>
			) : null}
			{(onRetry || homeHref) && (
				<div className="mt-5 flex items-center gap-2">
					{onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex items-center gap-2 h-9 px-4 rounded-sm text-[11px] uppercase tracking-[0.18em] font-mono border border-red-500/40 bg-red-500/5 text-red-200 hover:bg-red-500/10 hover:border-red-400/60 transition-colors"
						>
							<RefreshCw className="w-3 h-3" strokeWidth={2} />
							{resolvedRetryLabel}
						</button>
					) : null}
					{homeHref ? (
						<Link
							href={homeHref}
							className="inline-flex items-center h-9 px-4 rounded-sm text-[11px] uppercase tracking-[0.18em] font-mono border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
						>
							{t("common.errorState.goHome")}
						</Link>
					) : null}
				</div>
			)}
		</div>
	);
}

export default ErrorState;
