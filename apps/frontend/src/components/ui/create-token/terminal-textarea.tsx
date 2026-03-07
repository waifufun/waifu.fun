"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
export interface TerminalTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { prefix?: string; }
const TerminalTextarea = React.forwardRef<HTMLTextAreaElement, TerminalTextareaProps>(({ className, prefix = ">", ...props }, ref) => {
	const [isFocused, setIsFocused] = React.useState(false);
	return (
		<div className={cn("relative w-full bg-[#0a0a0c] border rounded-sm transition-all", isFocused ? "border-[#00ff87] shadow-[0_0_12px_rgba(0,255,135,0.15)]" : "border-[rgba(255,255,255,0.08)]", className)}>
			<div className="flex items-center gap-1.5 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]"><div className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/80" /><span className="ml-2 text-[10px] text-[#52525b] font-mono uppercase tracking-widest">prompt.ai</span></div>
			<div className="flex p-3 gap-2"><span className={cn("font-mono text-sm font-bold select-none", isFocused ? "text-[#00ff87]" : "text-[#00ff87]/50")}>{prefix}</span><textarea ref={ref} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} className="flex-1 min-h-[60px] bg-transparent resize-none outline-none font-mono text-sm text-[#e4e4e7] placeholder-[#52525b] caret-[#00ff87]" {...props} /></div>
			{isFocused && !props.value && !props.defaultValue && <div className="absolute bottom-3 left-[34px] w-2 h-4 bg-[#00ff87] animate-blink pointer-events-none" />}
		</div>
	);
});
TerminalTextarea.displayName = "TerminalTextarea";
export { TerminalTextarea };
