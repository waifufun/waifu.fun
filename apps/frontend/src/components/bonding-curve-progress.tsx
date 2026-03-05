import { Fragment } from "react";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import Progressbar from "./progressbar";
import { formatNumber } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function BondingCurveProgress({
	token,
	title,
	showTooltip,
}: { token: IToken; title?: string; showTooltip?: boolean }) {
	const curveProgress = token?.curveProgress;
	if (typeof curveProgress !== "number" || token?.curveCompleted || token?.imported) {
		return null;
	}

	const currentReserveLamports = token?.bondingCurveBalance ? token.bondingCurveBalance * LAMPORTS_PER_SOL : 0;
	const curveLimitLamports = token?.curveLimit || 113 * LAMPORTS_PER_SOL;
	const solRequiredForMigration = Math.max(0, (curveLimitLamports - currentReserveLamports) / LAMPORTS_PER_SOL);

	return (
		<Fragment>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-4 justify-between">
					<div className="text-sm font-bold text-gray-200 uppercase tracking-wider inline-flex gap-2">
						{title ? title : "Bonding curve progress:"}
						<span className="text-waifufun-background-action-highlight">{curveProgress.toFixed(2)}%</span>
					</div>
					{showTooltip ? (
						<Tooltip>
							<TooltipTrigger>
								<AlertCircle className="text-waifufun-icon-secondary" size={16} />
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
				<Progressbar max={100} height="h-4" value={Number(curveProgress.toFixed(2))} />
				{solRequiredForMigration > 0 ? (
					<div className="text-xs text-waifufun-text-primary">
						There is{" "}
						<span className="text-waifufun-background-action-highlight">
							{formatNumber(Number(currentReserveLamports / LAMPORTS_PER_SOL), false, true)} SOL
						</span>{" "}
						in the bonding curve.
						{solRequiredForMigration > 0 && (
							<>
								{" "}
								<span className="text-waifufun-background-action-highlight">
									{formatNumber(solRequiredForMigration, true, true)} more SOL
								</span>{" "}
								is required for migration.
							</>
						)}
					</div>
				) : null}
			</div>
			<div className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
		</Fragment>
	);
}
