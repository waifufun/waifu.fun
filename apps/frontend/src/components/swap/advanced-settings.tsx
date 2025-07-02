"use client";
import { useState } from "react";
import { AlertCircle, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Switch } from "../switch-button";
import useSlippage from "@/hooks/use-slippage";
import { Button } from "../ui/button";
import useSpeed, { type TSpeed } from "@/hooks/use-speed";

export default function AdvancedSettings() {
	const [open, setOpen] = useState(false);
	const { slippage, setSlippage } = useSlippage();
	const { speed, setSpeed } = useSpeed();

	return (
		<div className="w-full">
			<div className="w-full flex items-center justify-between text-xs font-medium text-white">
				<span className="text-xs">Advanced Settings</span>
				<Switch checked={open} onCheckedChange={setOpen} />
			</div>

			{open && (
				<div className="py-4 flex flex-col gap-4 w-full border-t pt-4 mt-4 border-autofun-stroke-primary">
					{/* Speed */}
					<div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between p-2">
						<div className="flex items-center gap-1">
							<span className="text-xs text-white font-medium">Speed</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<HelpCircle size={16} className="text-autofun-text-secondary" />
								</TooltipTrigger>
								<TooltipContent>
									<span>Choose how fast your transaction executes</span>
								</TooltipContent>
							</Tooltip>
						</div>

						<div className="flex flex-wrap gap-2 xl:overflow-hidden">
							{(["normal", "turbo", "ultra"] as TSpeed[]).map((label: TSpeed) => (
								<Button
									key={label}
									onClick={() => setSpeed(label)}
									className={cn(
										"flex-1 text-sm max-h-[36px] h-full capitalize bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] font-medium text-white hover:bg-[#1a1a1a] transition-colors",
										"border border-transparent",
										String(speed) === String(label) && "border border-[#03FF24]",
									)}
								>
									{String(label)}
								</Button>
							))}
						</div>
					</div>

					{/* Slippage */}
					<div className="flex  flex-col gap-4">
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-1">
								<span className="text-xs text-white font-medium">Slippage</span>

								<Tooltip>
									<TooltipTrigger asChild>
										<HelpCircle size={16} className="text-autofun-text-secondary" />
									</TooltipTrigger>
									<TooltipContent>
										<span>This is the maximum amount of slippage you are willing to accept when placing the trade</span>
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
								"p-2 bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] text-xs gap-2 items-center transition-all duration-200",
							])}
						>
							<AlertCircle className="text-autofun-background-action-highlight" />
							Your transaction may be frontrun and result in an unfavorable trade
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
