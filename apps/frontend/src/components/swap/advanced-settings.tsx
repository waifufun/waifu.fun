"use client";
import { useState } from "react";
import { AlertCircle, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Switch } from "../switch-button";
import useSlippage from "@/hooks/use-slippage";

export default function AdvancedSettings() {
	const [open, setOpen] = useState(false);
	const { slippage, setSlippage } = useSlippage();

	return (
		<div className="w-full">
			<div className="w-full flex items-center justify-between text-sm font-medium text-white">
				<span className="text-base">Advanced Settings</span>
				<Switch checked={open} onCheckedChange={setOpen} />
			</div>

			{open && (
				<div className="mt-2 py-3 rounded-lg flex flex-col gap-4 w-full">
					{/* Speed
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1">
							<span className="text-base text-white font-medium">Speed</span>

							<Tooltip>
								<TooltipTrigger asChild>
									<HelpCircle size={14} className="text-gray-400" />
								</TooltipTrigger>
								<TooltipContent className="bg-black text-white text-xs">
									Choose how fast your transaction executes
								</TooltipContent>
							</Tooltip>
						</div>

						<div className="w-[255px] h-[36px] bg-[#101010] rounded-md flex overflow-hidden">
							{["normal", "turbo", "ultra"].map((label) => (
								<Button
									key={label}
									onClick={() => updateSetting("speed", label)}
									className={cn(
										"flex-1 h-full rounded-md text-base capitalize bg-transparent font-medium text-white hover:bg-[#1a1a1a] transition-colors",
										"border border-transparent",
										settings.speed === label && "border border-[#03FF24]",
									)}
								>
									{label}
								</Button>
							))}
						</div>
					</div> */}

					{/* Slippage */}
					<div className="flex  flex-col gap-4">
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-1">
								<span className="text-base text-white font-medium">Slippage</span>

								<Tooltip>
									<TooltipTrigger asChild>
										<HelpCircle size={14} className="text-gray-400" />
									</TooltipTrigger>
									<TooltipContent className="bg-black text-white text-xs">
										this is the maximum amount of slippage you are willing to accept when placing the trade
									</TooltipContent>
								</Tooltip>
							</div>

							<div className="relative max-w-[85px] h-[32px]">
								<Input
									type="number"
									className="w-full h-full pr-6 text-sm text-right bg-gradient-to-b from-[#171717] to-[#141414]"
									value={slippage / 10}
									onChange={(e) => setSlippage(Number(e.target.value) * 10)}
								/>
								<span className="absolute right-2 top-1/2 -translate-y-1/2 text-autofun-background-action-highlight text-sm pointer-events-none">
									%
								</span>
							</div>
						</div>

						<div
							className={cn([
								slippage > 40
									? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
									: "hidden",
								"p-2 bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] rounded-xl text-sm gap-2 items-center transition-all duration-200",
							])}
						>
							<AlertCircle className="text-autofun-background-action-highlight" />
							Your transaction may be frontrun and result in an unfavorable trade
						</div>
					</div>

					{/* Tx Deadline */}
					{/* <div className="flex items-center justify-between w-full">
						<div className="flex items-center gap-1">
							<span className="text-base text-white font-medium">Tx Deadline</span>
							<Tooltip>
								<TooltipTrigger>
									<HelpCircle size={14} className="text-gray-400" />
								</TooltipTrigger>
								<TooltipContent className="bg-black text-white text-xs">
									Set the maximum time (in minutes) your transaction can take
								</TooltipContent>
							</Tooltip>
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
					</div> */}
				</div>
			)}
		</div>
	);
}
