"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { Bot, ChartCandlestick } from "lucide-react";

export type TokenDetailViewMode = "agent" | "market";

const MODES: Array<{
	value: TokenDetailViewMode;
	labelKey: string;
	icon: typeof Bot;
}> = [
	{
		value: "agent",
		labelKey: "token.viewMode.agent",
		icon: Bot,
	},
	{
		value: "market",
		labelKey: "token.viewMode.market",
		icon: ChartCandlestick,
	},
];

export default function ViewModeToggle({
	value,
	onChange,
}: {
	value: TokenDetailViewMode;
	onChange: (value: TokenDetailViewMode) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="inline-flex items-center rounded-sm border border-white/[0.06] bg-[#08080a] p-0.5">
			{MODES.map((mode) => {
				const Icon = mode.icon;
				const active = value === mode.value;
				return (
					<button
						key={mode.value}
						type="button"
						onClick={() => onChange(mode.value)}
						className={cn(
							"inline-flex min-h-[30px] items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors",
							active
								? "border border-[#00ff87]/20 bg-[#00ff87]/[0.06] text-[#00ff87]"
								: "border border-transparent text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400",
						)}
						aria-pressed={active}
					>
						<Icon className="size-3" />
						{t(mode.labelKey)}
					</button>
				);
			})}
		</div>
	);
}
