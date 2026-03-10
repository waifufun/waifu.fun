"use client";

import { cn } from "@/lib/utils";

interface SmpteBarsProps {
	className?: string;
	height?: number | string;
}

/**
 * SmpteBars
 * SMPTE color bars component for loading states.
 * Green-tinted vertical bars that cycle, inspired by classic broadcast test patterns.
 * Respects prefers-reduced-motion: disables flicker animation.
 */
export function SmpteBars({ className, height = 8 }: SmpteBarsProps) {
	const bars = [
		"#08080A",
		"#003D20",
		"#006B38",
		"#00994F",
		"#00CC6A",
		"#00FF87",
		"#66FFAB",
	];

	const heightValue = typeof height === "number" ? `${height}px` : height;

	return (
		<>
			<style>{`
				@keyframes smpte-flicker {
					50% { opacity: 0.95; }
				}

				.smpte-bar {
					flex: 1;
					animation: smpte-flicker 0.1s steps(2) infinite;
				}

				@media (prefers-reduced-motion: reduce) {
					.smpte-bar {
						animation: none;
					}
				}
			`}</style>
			<div
				role="progressbar"
				aria-label="Loading"
				className={cn("flex w-full", className)}
				style={{ height: heightValue }}
			>
				{bars.map((color, i) => (
					<div
						key={i}
						className="smpte-bar"
						style={{ backgroundColor: color }}
					/>
				))}
			</div>
		</>
	);
}

export default SmpteBars;
