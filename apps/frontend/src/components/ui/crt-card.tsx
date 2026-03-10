"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CrtCardProps {
	children: ReactNode;
	className?: string;
}

/**
 * CrtCard
 * Card component with CRT glow on hover.
 * Background: #111114, subtle border rgba(255,255,255,0.06).
 * On hover: green glow box-shadow with smooth transition.
 * Respects prefers-reduced-motion: disables the transition/glow animation.
 */
export function CrtCard({ children, className }: CrtCardProps) {
	return (
		<>
			<style>{`
				.crt-card {
					background-color: #111114;
					border: 1px solid rgba(255, 255, 255, 0.06);
					border-radius: 0.5rem;
					transition: box-shadow 0.3s ease, border-color 0.3s ease;
				}

				.crt-card:hover {
					box-shadow: 0 0 20px rgba(0, 255, 135, 0.15),
					            inset 0 0 20px rgba(0, 255, 135, 0.05);
					border-color: rgba(0, 255, 135, 0.3);
				}

				@media (prefers-reduced-motion: reduce) {
					.crt-card {
						transition: none;
					}
					.crt-card:hover {
						box-shadow: 0 0 10px rgba(0, 255, 135, 0.1);
					}
				}
			`}</style>
			<div className={cn("crt-card", className)}>
				{children}
			</div>
		</>
	);
}

export default CrtCard;
