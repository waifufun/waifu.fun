"use client";
import { cn } from "@/lib/utils";
import { Rocket, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface DeployButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	isLoading?: boolean;
	loadingText?: string;
}

export function DeployButton({ children, isLoading = false, loadingText = "LAUNCHING...", className, disabled, ...props }: DeployButtonProps) {
	const isDisabled = disabled || isLoading;
	return (
		<button type="button" disabled={isDisabled} className={cn("relative w-full group overflow-hidden py-4 px-6 rounded-sm font-bold text-lg uppercase tracking-wider transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#00ff87] focus:ring-offset-2 focus:ring-offset-[#08080a]", isDisabled ? "bg-[#1a1a1f] text-[#52525b] cursor-not-allowed" : "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e] cursor-pointer", className)} {...props}>
			{!isDisabled && <><div className="absolute inset-0 rounded-sm transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{ boxShadow: '0 0 30px rgba(0,255,135,0.4), 0 0 60px rgba(0,255,135,0.2)' }} /><div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 45%, rgba(255,255,255,0.2) 50%, transparent 55%)', animation: 'shine 2s ease-in-out infinite' }} /></>}
			<span className="relative flex items-center justify-center gap-2">{isLoading ? <><Loader2 size={20} className="animate-spin" /><span>{loadingText}</span></> : <><Rocket size={20} className="group-hover:animate-bounce" /><span>{children || "LAUNCH TOKEN"}</span></>}</span>
		</button>
	);
}
