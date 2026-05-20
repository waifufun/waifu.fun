/**
 * Status card for the hero strip.
 *
 * Two halves: the left reads like a system-health line item ("Status",
 * green dot, "Operational", subtitle); the right is a small radar/sonar
 * visual built from concentric SVG circles. Above the card a row of
 * tiny avatars hints at "other agents on platform" (placeholder
 * gradients until we ship more agents).
 */

"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

import { Panel, Pulse } from "./_primitives";

type StatusCardProps = {
	status?: "online" | "degraded" | "offline";
	daysOperating: number;
	className?: string;
	otherAgents?: number;
};

export function StatusCard({ status = "online", daysOperating, className, otherAgents = 4 }: StatusCardProps) {
	const isOnline = status === "online";
	const tone = isOnline ? "positive" : status === "degraded" ? "accent" : "negative";
	const statusLabel = isOnline ? "Operational" : status === "degraded" ? "Degraded" : "Offline";
	const statusColor =
		status === "online" ? "var(--positive)" : status === "degraded" ? "var(--accent)" : "var(--negative)";

	return (
		<Panel className={cn("h-full", className)}>
			<div className="flex h-full flex-col justify-between gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">
							Status
						</span>
					</div>
					<OtherAgentsStrip count={otherAgents} />
				</div>

				<div className="flex items-center justify-between gap-3">
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
						<p className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums uppercase tracking-[0.18em]">
							Day {daysOperating}
						</p>
					</div>
					<RadarViz color={statusColor} />
				</div>
			</div>
		</Panel>
	);
}

function OtherAgentsStrip({ count }: { count: number }) {
	// Deterministic gradient stops per slot so SSR matches the client.
	const stops = [
		["#3b3f5c", "#1a1a25"],
		["#5c3b46", "#251a1f"],
		["#3b5c4a", "#1a2521"],
		["#5c563b", "#25221a"],
		["#4a3b5c", "#1f1a25"],
	];
	const clamped = Math.min(count, stops.length);
	return (
		<div aria-hidden className="flex items-center -space-x-1.5">
			{Array.from({ length: clamped }).map((_, i) => {
				const pair = stops[i] ?? stops[0] ?? ["#3b3f5c", "#1a1a25"];
				const [a, b] = pair;
				return (
					<span
						className="inline-block h-5 w-5 rounded-full ring-2 ring-[var(--bg-panel)]"
						key={`peer-${a}-${b}`}
						style={{
							background: `linear-gradient(135deg, ${a}, ${b})`,
						}}
					/>
				);
			})}
		</div>
	);
}

function RadarViz({ color }: { color: string }) {
	const gid = useId();
	return (
		<svg aria-hidden className="shrink-0" height={72} viewBox="0 0 72 72" width={72} xmlns="http://www.w3.org/2000/svg">
			<title>Operational radar</title>
			<defs>
				<radialGradient cx="50%" cy="50%" id={`radar-glow-${gid}`} r="50%">
					<stop offset="0%" stopColor={color} stopOpacity="0.18" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</radialGradient>
			</defs>
			<circle cx="36" cy="36" fill={`url(#radar-glow-${gid})`} r="34" />
			<circle cx="36" cy="36" fill="none" r="30" stroke={color} strokeOpacity="0.18" strokeWidth="1" />
			<circle cx="36" cy="36" fill="none" r="22" stroke={color} strokeOpacity="0.28" strokeWidth="1" />
			<circle cx="36" cy="36" fill="none" r="14" stroke={color} strokeOpacity="0.45" strokeWidth="1" />
			<circle cx="36" cy="36" fill={color} r="3" />
			<circle cx="36" cy="36" fill="none" r="6" stroke={color} strokeOpacity="0.55" strokeWidth="1">
				<animate attributeName="r" dur="2.4s" repeatCount="indefinite" values="3;30" />
				<animate attributeName="stroke-opacity" dur="2.4s" repeatCount="indefinite" values="0.55;0" />
			</circle>
			{/* sweep line */}
			<line stroke={color} strokeOpacity="0.35" strokeWidth="1" x1="36" x2="66" y1="36" y2="36">
				<animateTransform
					attributeName="transform"
					dur="6s"
					from="0 36 36"
					repeatCount="indefinite"
					to="360 36 36"
					type="rotate"
				/>
			</line>
		</svg>
	);
}
