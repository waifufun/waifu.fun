"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Control = {
	id: string;
	label: string;
	description: string;
	tone: "amber" | "orange" | "red";
};

const CONTROLS: Control[] = [
	{
		id: "pause",
		label: "Pause brain",
		description: "Halt new actions. Positions stay open, adapters keep data flowing.",
		tone: "amber",
	},
	{
		id: "freeze",
		label: "Freeze withdrawals",
		description: "Block treasury outflows while you investigate.",
		tone: "orange",
	},
	{
		id: "kill",
		label: "Kill agent",
		description: "Full stop. Signals permanent shutdown. Irreversible.",
		tone: "red",
	},
];

const TONE: Record<Control["tone"], string> = {
	amber: "border-amber-500/30 text-amber-300",
	orange: "border-orange-500/30 text-orange-300",
	red: "border-red-500/30 text-red-300",
};

const TOOLTIP_COPY = "Coming in v2. Will route through a patron-scoped endpoint instead of the admin token.";

export default function EmergencyControls() {
	return (
		<section
			aria-label="Emergency controls"
			className="p-5 rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C]"
		>
			<header className="flex items-center justify-between mb-1">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">Emergency</h2>
				<span className="text-xs text-neutral-500">v2</span>
			</header>
			<p className="text-xs text-neutral-500 mb-4">
				Break-glass controls. Disabled in v1 until patron-scoped endpoints land.
			</p>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{CONTROLS.map((control) => (
					<Tooltip key={control.id}>
						<TooltipTrigger asChild>
							<button
								type="button"
								disabled
								aria-disabled="true"
								aria-label={`${control.label} (coming in v2)`}
								className={cn(
									"flex flex-col items-start gap-1 text-left p-4 rounded-md border bg-[#0C0C0C] cursor-not-allowed opacity-70",
									TONE[control.tone],
								)}
							>
								<span className="text-sm font-medium">{control.label}</span>
								<span className="text-xs text-neutral-400 leading-snug">{control.description}</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">{TOOLTIP_COPY}</TooltipContent>
					</Tooltip>
				))}
			</div>
		</section>
	);
}
