/**
 * Standard page wrapper. Centers content and applies the canonical
 * waifu.fun page padding (`pt-10 pb-24` / `px-5 md:px-8`).
 *
 * Pages that needed bespoke padding before this lived (the launch page
 * used `py-8`, the portfolio page used `py-6`, the agents page used
 * `pt-10 pb-24`) should opt-in incrementally, this is the source of
 * truth going forward.
 */
import { cn } from "@/lib/utils";

type PageShellProps = {
	children: React.ReactNode;
	className?: string;
	maxWidth?: "default" | "wide" | "narrow";
	padded?: boolean;
};

const MAX_WIDTHS = {
	default: "max-w-5xl",
	wide: "max-w-6xl",
	narrow: "max-w-3xl",
} as const;

export function PageShell({ children, className, maxWidth = "default", padded = true }: PageShellProps) {
	return (
		<div className={cn("min-h-screen text-white", className)}>
			<div className={cn("mx-auto w-full", MAX_WIDTHS[maxWidth], padded && "px-5 md:px-8 pt-10 pb-24")}>{children}</div>
		</div>
	);
}

export function PageHeader({
	eyebrow,
	title,
	subtitle,
	right,
}: {
	eyebrow?: string;
	title: string;
	subtitle?: string | React.ReactNode;
	right?: React.ReactNode;
}) {
	return (
		<header className="mb-8">
			{eyebrow ? (
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-3">{eyebrow}</div>
			) : null}
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="min-w-0">
					<h1 className="text-3xl md:text-4xl leading-tight tracking-tight text-white">{title}</h1>
					{subtitle ? <div className="mt-2 text-sm text-white/55 max-w-2xl">{subtitle}</div> : null}
				</div>
				{right ? <div className="shrink-0">{right}</div> : null}
			</div>
		</header>
	);
}

export default PageShell;
