"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function SystemPromptReveal({
	systemPrompt,
}: {
	systemPrompt: string;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
			>
				<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/60">
					{t("agent.systemPrompt.viewLabel")}
				</span>
				<ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform duration-200", open && "rotate-180")} />
			</button>
			{open && (
				<div className="px-4 pb-5 pt-1 border-t border-white/5">
					<pre className="text-[11px] leading-relaxed text-white/70 font-mono whitespace-pre-wrap break-words">
						{systemPrompt}
					</pre>
				</div>
			)}
		</div>
	);
}
