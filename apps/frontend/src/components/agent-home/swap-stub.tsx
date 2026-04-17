"use client";

import { useState } from "react";
import { ArrowDownUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentData } from "./types";

export default function SwapStub({ agent }: { agent: AgentData }) {
	const [side, setSide] = useState<"buy" | "sell">("buy");
	const [amount, setAmount] = useState("");

	const fourMemeUrl = agent.fourMemeUrl ?? `https://four.meme/token/${agent.tokenAddress}`;

	const payLabel = side === "buy" ? (agent.raisedToken ?? "BNB") : `$${agent.ticker}`;
	const getLabel = side === "buy" ? `$${agent.ticker}` : (agent.raisedToken ?? "BNB");

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
			<div className="flex items-center gap-1.5 mb-4">
				<SideButton active={side === "buy"} onClick={() => setSide("buy")} label="buy" accent />
				<SideButton active={side === "sell"} onClick={() => setSide("sell")} label="sell" />
			</div>

			<div className="space-y-2">
				<div className="border border-white/10 rounded-sm bg-black/40 px-3 py-3">
					<div className="flex items-baseline justify-between mb-1.5">
						<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">you pay</span>
						<span className="text-[10px] font-mono text-white/40">{payLabel}</span>
					</div>
					<input
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.00"
						inputMode="decimal"
						className="w-full bg-transparent text-2xl font-mono text-white placeholder:text-white/15 outline-none tracking-tight"
					/>
				</div>

				<div className="flex justify-center">
					<div className="w-7 h-7 rounded-sm border border-white/10 bg-[#08080a] flex items-center justify-center text-white/30">
						<ArrowDownUp className="w-3 h-3" />
					</div>
				</div>

				<div className="border border-white/10 rounded-sm bg-black/40 px-3 py-3">
					<div className="flex items-baseline justify-between mb-1.5">
						<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">you get</span>
						<span className="text-[10px] font-mono text-white/40">{getLabel}</span>
					</div>
					<div className="text-2xl font-mono text-white/20 tracking-tight">—</div>
				</div>
			</div>

			<a
				href={fourMemeUrl}
				target="_blank"
				rel="noreferrer"
				className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-sm bg-[#22c55e] text-black hover:bg-[#22c55e]/90 text-[11px] uppercase tracking-[0.2em] font-mono transition-colors"
			>
				trade on four.meme
				<ExternalLink className="w-3.5 h-3.5" />
			</a>

			<div className="mt-3 text-[10px] font-mono text-white/30 text-center">native swap coming soon</div>
		</div>
	);
}

function SideButton({
	active,
	onClick,
	label,
	accent,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	accent?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex-1 h-9 rounded-sm text-[11px] font-mono uppercase tracking-[0.2em] transition-colors",
				active
					? accent
						? "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/40"
						: "bg-white/5 text-white border border-white/20"
					: "border border-transparent text-white/35 hover:text-white/70",
			)}
		>
			{label}
		</button>
	);
}
