"use client";

import { cn } from "@/lib/utils";

/**
 * ECG-style heartbeat line: animated when alive, flat when dead, subtle pulse when sleeping.
 * Pure SVG + CSS, no library.
 */
export function HeartbeatLine({
	status,
	className,
}: {
	status: "alive" | "dead" | "sleeping";
	className?: string;
}) {
	// One beat = long full-width baseline (0–62) + short spike (62–80). Repeating so scroll shows baseline + occasional spike.
	const oneBeat = "M0,8 L62,8 L65,4 L68,12 L71,8 L80,8";
	const path = [oneBeat, "L142,8 L145,4 L148,12 L151,8 L160,8", "L222,8 L225,4 L228,12 L231,8 L240,8"].join(" ");

	const isAnimated = status === "alive" || status === "sleeping";

	return (
		<div
			className={cn("relative w-full min-w-0 overflow-hidden rounded", className)}
			aria-hidden
			style={{ width: "100%" }}
		>
			<svg
				viewBox="0 0 240 16"
				preserveAspectRatio="none"
				className="w-full h-full min-w-full block"
				style={{ width: "100%", minWidth: "100%" }}
				aria-hidden
			>
				<title>Heartbeat indicator</title>
				<defs>
					<linearGradient
						id="heartbeat-gradient-alive"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="0%"
					>
						<stop offset="0%" stopColor="#00ff87" stopOpacity="0.3" />
						<stop offset="50%" stopColor="#00ff87" stopOpacity="1" />
						<stop offset="100%" stopColor="#00ff87" stopOpacity="0.3" />
					</linearGradient>
					<linearGradient
						id="heartbeat-gradient-dead"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="0%"
					>
						<stop offset="0%" stopColor="#ef4444" />
						<stop offset="100%" stopColor="#ef4444" />
					</linearGradient>
					<linearGradient
						id="heartbeat-gradient-sleeping"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="0%"
					>
						<stop offset="0%" stopColor="#71717a" stopOpacity="0.6" />
						<stop offset="50%" stopColor="#71717a" stopOpacity="1" />
						<stop offset="100%" stopColor="#71717a" stopOpacity="0.6" />
					</linearGradient>
				</defs>
				{status === "dead" ? (
					/* Flat line for dead - full width */
					<line
						x1="0"
						y1="8"
						x2="240"
						y2="8"
						stroke="url(#heartbeat-gradient-dead)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				) : (
					<path
						d={path}
						fill="none"
						stroke={
							status === "alive"
								? "url(#heartbeat-gradient-alive)"
								: "url(#heartbeat-gradient-sleeping)"
						}
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray="80 160"
						strokeDashoffset="0"
						className={cn(
							isAnimated && status === "alive" && "animate-heartbeat-scroll",
							isAnimated && status === "sleeping" && "animate-heartbeat-scroll-slow",
						)}
						style={
							isAnimated
								? undefined
								: { strokeDashoffset: 0 }
						}
					/>
				)}
			</svg>
		</div>
	);
}
