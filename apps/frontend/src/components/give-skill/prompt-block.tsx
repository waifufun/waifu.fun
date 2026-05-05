"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

interface PromptBlockProps {
	prompt: string;
	className?: string;
}

export default function PromptBlock({ prompt, className }: PromptBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard unavailable, fall through silently
		}
	}, [prompt]);

	return (
		<div className={cn("relative w-full", className)}>
			<button
				type="button"
				onClick={handleCopy}
				className={cn(
					"absolute right-3 top-3 z-10 inline-flex items-center gap-1.5",
					"border border-white/15 bg-[#0b0b0d] px-3 py-1.5",
					"text-[10px] font-mono uppercase tracking-[0.18em] text-[#a1a1aa]",
					"hover:border-[#00ff87]/40 hover:text-[#00ff87] transition-colors",
				)}
				aria-label={copied ? "copied" : "copy prompt"}
			>
				{copied ? (
					<>
						<Check className="size-3" aria-hidden="true" />
						<span>copied</span>
					</>
				) : (
					<>
						<Copy className="size-3" aria-hidden="true" />
						<span>copy</span>
					</>
				)}
			</button>

			<pre
				className={cn(
					"w-full overflow-x-auto border border-white/10 bg-[#0b0b0d]",
					"px-5 py-5 pr-20 text-[13px] leading-relaxed text-[#e4e4e7]",
					"font-mono whitespace-pre-wrap break-words",
				)}
			>
				{prompt}
			</pre>
		</div>
	);
}
