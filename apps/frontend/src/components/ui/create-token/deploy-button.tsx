"use client";
import { cn } from "@/lib/utils";
import { Rocket, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface DeployButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	isLoading?: boolean;
	loadingText?: string;
	balance?: number;
	estimatedCost?: number;
	prebuyAmount?: number;
}

export function DeployButton({
	children,
	isLoading = false,
	loadingText = "LAUNCHING...",
	className,
	disabled,
	balance,
	estimatedCost = 0.03,
	prebuyAmount = 0,
	...props
}: DeployButtonProps) {
	const isDisabled = disabled || isLoading;
	const totalCost = estimatedCost + prebuyAmount;

	return (
		<div className="w-full">
			{/* Cost Estimate */}
			{balance !== undefined && (
				<div className="mb-3 space-y-1">
					<div className="flex items-center justify-between text-xs">
						<span className="text-[#a1a1aa]">Estimated cost:</span>
						<span className="text-[#e4e4e7] font-mono">
							~{estimatedCost.toFixed(2)} BNB (${(estimatedCost * 600).toFixed(0)})
							{prebuyAmount > 0 && ` + ${prebuyAmount.toFixed(1)} BNB pre-buy`}
						</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-[#a1a1aa]">Your balance:</span>
						<span className={cn("font-mono", balance < totalCost ? "text-[#ef4444]" : "text-[#00ff87]")}>
							{balance.toFixed(4)} BNB
						</span>
					</div>
				</div>
			)}

			{/* Deploy Button */}
			<button
				type="button"
				disabled={isDisabled}
				className={cn(
					"relative w-full h-14 group overflow-hidden px-6 rounded-sm font-bold text-lg uppercase tracking-wider transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#00ff87] focus:ring-offset-2 focus:ring-offset-[#08080a]",
					isDisabled
						? "bg-[#1a1a1f] text-[#52525b] cursor-not-allowed"
						: "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e] cursor-pointer",
					className,
				)}
				{...props}
			>
				{/* Subtle hover highlight */}
				{!isDisabled && !isLoading && (
					<div
						className="absolute inset-0 rounded-sm transition-opacity duration-300 opacity-0 group-hover:opacity-100"
						style={{ boxShadow: "0 0 12px rgba(0,255,135,0.12)" }}
					/>
				)}

				{/* Scanning line animation when loading */}
				{isLoading && (
					<div
						className="absolute inset-0 overflow-hidden"
						style={{
							background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
							animation: "scan 1.5s linear infinite",
						}}
					/>
				)}

				<span className="relative flex items-center justify-center gap-2">
					{isLoading ? (
						<>
							<Loader2 size={20} className="animate-spin" />
							<span>{loadingText}</span>
						</>
					) : (
						<>
							<Rocket size={20} className="group-hover:animate-bounce" />
							<span>{children || "LAUNCH TOKEN"}</span>
						</>
					)}
				</span>
			</button>

			<style jsx>{`
				@keyframes scan {
					0% {
						transform: translateX(-100%);
					}
					100% {
						transform: translateX(100%);
					}
				}
			`}</style>
		</div>
	);
}
