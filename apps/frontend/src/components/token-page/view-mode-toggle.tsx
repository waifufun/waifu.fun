"use client";

import { cn } from "@/lib/utils";
import { Bot, ChartCandlestick } from "lucide-react";

export type TokenDetailViewMode = "agent" | "market";

const MODES: Array<{
	value: TokenDetailViewMode;
	label: string;
	icon: typeof Bot;
	description: string;
}> = [
	{
		value: "agent",
		label: "agent",
		icon: Bot,
		description: "Default layout prioritizing status, operator controls, and runtime context.",
	},
	{
		value: "market",
		label: "market",
		icon: ChartCandlestick,
		description: "Dedicated chart, trading, and activity view.",
	},
];

export default function ViewModeToggle({
	value,
	onChange,
}: {
	value: TokenDetailViewMode;
	onChange: (value: TokenDetailViewMode) => void;
}) {
	return (
		<div className="inline-flex flex-col gap-1">
			<div className="inline-flex w-fit items-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#08080a] p-1">
				{MODES.map((mode) => {
					const Icon = mode.icon;
					const active = value === mode.value;
					return (
						<button
							key={mode.value}
							type="button"
							onClick={() => onChange(mode.value)}
							className={cn(
								"inline-flex min-h-[34px] items-center gap-2 rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
								active
									? "border border-[#00ff87]/25 bg-[#00ff87]/10 text-[#00ff87]"
									: "border border-transparent text-[#71717a] hover:bg-white/5 hover:text-[#e4e4e7]",
							)}
							aria-pressed={active}
							title={mode.description}
						>
							<Icon className="size-3.5" />
							{mode.label}
						</button>
					);
				})}
			</div>
			<p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#52525b]">
				{value === "agent" ? "agent-first layout" : "full trading surface"}
			</p>
		</div>
	);
}
