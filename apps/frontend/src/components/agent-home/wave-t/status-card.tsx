/**
 * Status card for the hero strip.
 *
 * Keeps the operational state readable without decorative radar rings or
 * avatar dots that look like unlabeled status indicators.
 */

"use client";

import { useTranslation } from "@/contexts/locale-context";
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
	const { t } = useTranslation();
	const isOnline = status === "online";
	const tone = isOnline ? "positive" : status === "degraded" ? "accent" : "negative";
	const statusLabel = isOnline
		? t("agent.status.operational")
		: status === "degraded"
			? t("agent.status.degraded")
			: t("agent.status.offline");
	const statusColor =
		status === "online" ? "var(--positive)" : status === "degraded" ? "var(--accent)" : "var(--negative)";

	return (
		<Panel className={cn("h-full", className)}>
			<div className="flex h-full flex-col justify-between gap-3">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">
						{t("agent.status.label")}
					</span>
					<span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums uppercase tracking-[0.18em]">
						{t("agent.status.day", { count: String(daysOperating) })}
					</span>
				</div>

				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-2">
						<Pulse tone={tone} />
						<span className="font-mono text-[13px] tabular-nums" style={{ color: statusColor }}>
							{statusLabel.toLowerCase()}
						</span>
					</div>
					<div className="flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
						<span className="text-[var(--text-tertiary)]">{t("agent.status.runwayLabel")}</span>
						{runwayDays == null ? (
							<span className="text-[var(--text-tertiary)]">{t("agent.status.runwayNotMeasured")}</span>
						) : (
							<span className="tabular-nums text-[var(--text-primary)]">
								{t("agent.status.runwayDays", { value: runwayDays >= 365 ? ">365" : String(Math.round(runwayDays)) })}
							</span>
						)}
					</div>
				</div>
			</div>
		</Panel>
	);
}
