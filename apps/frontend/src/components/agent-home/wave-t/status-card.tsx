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
	className?: string;
	otherAgents?: number;
};

export function StatusCard({ status = "online", daysOperating, className }: StatusCardProps) {
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
					<p className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.14em]">
						{isOnline ? "All systems normal" : "Investigating"}
					</p>
				</div>
			</div>
		</Panel>
	);
}
