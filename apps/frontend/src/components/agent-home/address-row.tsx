"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AddressRow({
	label,
	address,
}: {
	label: string;
	address: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		} catch (e) {
			console.error(e);
		}
	};

	const shortened = address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors group"
		>
			<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 w-24 shrink-0">{label}</span>
			<div className="flex-1 min-w-0 flex items-center justify-end gap-3">
				<span className="text-xs font-mono text-white/75 truncate hidden sm:inline">{address}</span>
				<span className="text-xs font-mono text-white/75 sm:hidden">{shortened}</span>
				<span
					className={cn(
						"inline-flex items-center justify-center w-7 h-7 rounded-sm border transition-colors shrink-0",
						copied
							? "border-[#22c55e]/60 text-[#22c55e]"
							: "border-white/10 text-white/30 group-hover:border-white/25 group-hover:text-white/70",
					)}
				>
					{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
				</span>
			</div>
		</button>
	);
}
