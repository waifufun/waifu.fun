"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";

type Control = {
	id: string;
	labelKey: string;
	descKey: string;
	tone: "neutral" | "warn" | "destructive";
};

const CONTROLS: Control[] = [
	{ id: "pause", labelKey: "patron.emergency.pauseLabel", descKey: "patron.emergency.pauseDesc", tone: "neutral" },
	{ id: "freeze", labelKey: "patron.emergency.freezeLabel", descKey: "patron.emergency.freezeDesc", tone: "warn" },
	{ id: "kill", labelKey: "patron.emergency.killLabel", descKey: "patron.emergency.killDesc", tone: "destructive" },
];

const TONE: Record<Control["tone"], string> = {
	neutral: "border-stroke-strong text-[#a1a1aa]",
	warn: "border-stroke-strong text-[#71717a]",
	destructive: "border-red-500/30 text-red-300",
};

export default function EmergencyControls() {
	const { t } = useTranslation();
	return (
		<section
			aria-label={t("patron.emergency.ariaLabel")}
			className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]"
		>
			<header className="flex items-center justify-between mb-1">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">{t("patron.emergency.title")}</h2>
				<span className="text-xs text-neutral-500">{t("patron.emergency.v2Badge")}</span>
			</header>
			<p className="text-xs text-neutral-500 mb-4">{t("patron.emergency.body")}</p>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{CONTROLS.map((control) => {
					const label = t(control.labelKey);
					return (
						<Tooltip key={control.id}>
							<TooltipTrigger asChild>
								<button
									type="button"
									disabled
									aria-disabled="true"
									aria-label={t("patron.emergency.comingV2Aria", { label })}
									className={cn(
										"flex flex-col items-start gap-1 text-left p-4 rounded-sm border bg-[#0C0C0C] cursor-not-allowed opacity-70",
										TONE[control.tone],
									)}
								>
									<span className="text-sm font-medium">{label}</span>
									<span className="text-xs text-neutral-400 leading-snug">{t(control.descKey)}</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="top">{t("patron.emergency.tooltipCopy")}</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</section>
	);
}
