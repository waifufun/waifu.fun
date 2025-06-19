"use client";

import type { IToken } from "@autofun/types";
import Progressbar from "./progressbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { AlertCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { Fragment } from "react";

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
		<Fragment>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-4 justify-between">
					<div className="text-sm font-bold text-gray-200 uppercase tracking-wider inline-flex gap-2">
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
				<Progressbar max={100} height="h-4" value={Number(curveProgress.toFixed(2))} />
				{typeof token?.bondingCurveBalance === "number" ? (
					<div className="text-xs text-autofun-text-primary">
						There is{" "}
						<span className="text-autofun-background-action-highlight">
							{formatNumber(Number(token?.bondingCurveBalance), false, true)} SOL
						</span>{" "}
						in the bonding curve.
					</div>
				) : null}
			</div>
			<div className="h-[2px] w-full bg-autofun-background-action-highlight/25" />
		</Fragment>
	);
}
