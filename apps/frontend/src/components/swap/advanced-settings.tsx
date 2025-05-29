import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Switch } from "../switch-button";
import type { IAdvancedSettingsProps, ISwapSettings } from "@autofun/types";

export default function AdvancedSettings({ settings, onChange }: IAdvancedSettingsProps) {
	const [open, setOpen] = useState(false);

	const updateSetting = (key: keyof ISwapSettings, value: string) => {
		if (onChange) {
			onChange({ ...settings, [key]: value });
		}
	};

	return (
		<div className="w-full">
			<button
				className="w-full flex items-center justify-between text-sm font-medium text-white"
				onClick={() => setOpen(!open)}
				type="button"
			>
				<span>Advanced Settings</span>
				<Switch checked={open} onCheckedChange={setOpen} />
			</button>

			{open && (
				<div className="mt-2 py-3 rounded-lg flex flex-col gap-4 w-full">
					{/* Speed */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1">
							<span className="text-base text-white font-medium">Speed</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<HelpCircle size={14} className="text-gray-400" />
									</TooltipTrigger>
									<TooltipContent className="bg-black text-white text-xs">
										Choose how fast your transaction executes
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>

						<div className="w-[255px] h-[36px] bg-[#101010] rounded-md flex overflow-hidden">
							{["Normal", "Turbo", "Ultra"].map((label) => (
								<Button
									key={label}
									onClick={() => updateSetting("speed", label)}
									className={cn(
										"flex-1 h-full text-base bg-transparent font-medium text-white hover:bg-[#1a1a1a] transition-colors",
										"border border-transparent", // default border
										settings.speed === label && "border border-[#03FF24] rounded-md",
									)}
								>
									{label}
								</Button>
							))}
						</div>
					</div>

					{/* Slippage */}
					<div className="flex items-center justify-between w-full">
						<div className="flex items-center gap-1">
							<span className="text-base text-white font-medium">Slippage</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<HelpCircle size={14} className="text-gray-400" />
									</TooltipTrigger>
									<TooltipContent className="bg-black text-white text-xs">
										this is the maximum amount of slippage you are willing to accept when placing the trade
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>

						<div className="relative max-w-[85px] h-[32px]">
							<Input
								className="w-full h-full pr-6 text-sm text-right bg-gradient-to-b from-[#171717] to-[#141414]"
								value={settings.slippage}
								onChange={(e) => updateSetting("slippage", e.target.value)}
							/>
							<span className="absolute right-2 top-1/2 -translate-y-1/2 text-autofun-background-action-highlight text-sm pointer-events-none">
								%
							</span>
						</div>
					</div>

					{/* Tx Deadline */}
					<div className="flex items-center justify-between w-full">
						<div className="flex items-center gap-1">
							<span className="text-base text-white font-medium">Tx Deadline</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<HelpCircle size={14} className="text-gray-400" />
									</TooltipTrigger>
									<TooltipContent className="bg-black text-white text-xs">
										Set the maximum time (in minutes) your transaction can take
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>

						<div className="relative w-[85px]">
							<Input
								className="w-full h-[32px] text-sm text-left bg-gradient-to-b from-[#171717] to-[#141414]"
								value={settings.deadline}
								onChange={(e) => updateSetting("deadline", e.target.value)}
							/>
							<span className="absolute right-2 top-1/2 -translate-y-1/2 text-autofun-background-action-highlight text-sm pointer-events-none">
								mins
							</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
