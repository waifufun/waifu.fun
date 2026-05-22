/**
 * Status card for the hero strip.
 *
 * Keeps the operational state readable without decorative radar rings or
 * avatar dots that look like unlabeled status indicators.
 */

"use client";

import { cn } from "@/lib/utils";

import { Panel, Pulse } from "./_primitives";

type StatusCardProps = {
	status?: "online" | "degraded" | "offline";
	daysOperating: number;
	/**
	 * Estimated days of runway given current treasury and burn rate. Read
	 * from the `/v2/agents/:address/burn-rate` endpoint upstream. Null when
	 * the endpoint is unavailable or the agent has zero recent outflow
	 * (effectively infinite runway, which is honest to surface as
	 * "not yet measured" rather than ∞).
	 */
	runwayDays?: number | null;
	className?: string;
};

export function StatusCard({ status = "online", daysOperating, runwayDays, className }: StatusCardProps) {
	const isOnline = status === "online";
	const tone = isOnline ? "positive" : status === "degraded" ? "accent" : "negative";
	const statusLabel = isOnline ? "Operational" : status === "degraded" ? "Degraded" : "Offline";
	const statusColor =
		status === "online" ? "var(--positive)" : status === "degraded" ? "var(--accent)" : "var(--negative)";

	return (
		<Panel className={cn("h-full", className)}>
			<div className="flex h-full flex-col justify-between gap-4">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">Status</span>
					<span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums uppercase tracking-[0.18em]">
						Day {daysOperating}
					</span>
				</div>

				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-2">
						<Pulse tone={tone} />
						<span className="font-medium text-[14px]" style={{ color: statusColor }}>
							{statusLabel}
						</span>
					</div>
					<div className="flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em]">
						<span className="text-[var(--text-tertiary)]">runway</span>
						{runwayDays == null ? (
							<span className="text-[var(--text-tertiary)]">not yet measured</span>
						) : (
							<span className="tabular-nums text-[var(--text-primary)]">
								{runwayDays >= 365 ? ">365" : Math.round(runwayDays)} days
							</span>
						)}
					</div>
				</div>
			</div>
		</Panel>
	);
}
