"use client";

import type { IToken } from "@autofun/types";
import Progressbar from "./progressbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { AlertCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function BondingCurveProgress({
	token,
	title,
	showTooltip,
}: { token: IToken; title?: string; showTooltip?: boolean }) {
	const curveProgress = token?.curveProgress;
	if (typeof curveProgress !== "number" || token?.curveCompleted || token?.imported) {
		return null;
	}
	return (
		<div className="rounded-lg bg-[#333333]/10 p-4">
			<div className="flex flex-col gap-3.5">
				<div className="flex items-center gap-4 justify-between">
					<div className="font-medium text-xl font-satoshi text-autofun-text-primary inline-flex gap-2">
						{title ? title : "Bonding curve progress:"}
						<span className="text-autofun-background-action-highlight">{curveProgress.toFixed(2)}%</span>
					</div>
					{showTooltip ? (
						<Tooltip>
							<TooltipTrigger>
								<AlertCircle className="text-autofun-icon-secondary" size={16} />
							</TooltipTrigger>
							<TooltipContent>
								<span>
									When the market cap reaches the graduation threshold,
									<br />
									the coin's liquidity will transition to Raydium.
								</span>
							</TooltipContent>
						</Tooltip>
					) : null}
				</div>
				{/* Bar */}
				<Progressbar max={100} value={Number(curveProgress.toFixed(2))} />
				{token?.bondingCurveBalance ? (
					<div className="text-base text-autofun-text-primary">
						There is {formatNumber(Number(token?.bondingCurveBalance), false, true)} SOL in the bonding curve.
					</div>
				) : null}
			</div>
		</div>
	);
}
