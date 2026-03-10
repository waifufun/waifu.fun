"use client";

import { cn } from "@/lib/utils";

interface GlitchTextProps {
	children: string;
	className?: string;
}

/**
 * GlitchText
 * Renders text with a CRT glitch effect using ::before/::after pseudo-elements.
 * Uses the data-text attribute pattern so CSS can duplicate the content.
 * Animation is disabled when prefers-reduced-motion is set.
 */
export function GlitchText({ children, className }: GlitchTextProps) {
	return (
		<>
			<style>{`
				.glitch-text {
					position: relative;
					display: inline-block;
				}

				.glitch-text::before,
				.glitch-text::after {
					content: attr(data-text);
					position: absolute;
					inset: 0;
					white-space: nowrap;
					overflow: hidden;
				}

				.glitch-text::before {
					color: #00FF87;
					animation: glitch 3s infinite;
					opacity: 0.6;
				}

				.glitch-text::after {
					color: #FF0000;
					animation: glitch 3s infinite reverse;
					opacity: 0.3;
				}

				@media (prefers-reduced-motion: reduce) {
					.glitch-text::before,
					.glitch-text::after {
						animation: none;
						display: none;
					}
				}
			`}</style>
			<span
				className={cn("glitch-text", className)}
				data-text={children}
			>
				{children}
			</span>
		</>
	);
}

export default GlitchText;
