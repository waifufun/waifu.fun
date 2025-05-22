import { getPercentageOfTotal } from "@/lib/utils";
import type { IToken } from "@autofun/types";

export default function BondingCurveProgress({ token }: { token: IToken }) {
	const curveProgress = token?.curveProgress;
	if (!curveProgress || token?.curveCompleted) {
		return null;
	}
	return (
		<div className="rounded-lg bg-[#333333]/10 p-4">
			<div className="flex flex-col gap-3.5">
				<div className="font-medium text-xl font-satoshi text-autofun-text-primary inline-flex gap-2">
					Bonding curve progress:{" "}
					<span className="text-autofun-background-action-highlight">{curveProgress.toFixed(2)}%</span>
				</div>
				<Progressbar max={100} value={Number(curveProgress).toFixed(2)} />
				{/* Bar */}
				<div className="text-base text-autofun-text-primary">There is 4.95 SOL in the bonding curve.</div>
			</div>
		</div>
	);
}

const Progressbar = ({ value, max }: { value: number; max: number }) => {
	const width = getPercentageOfTotal(value, max);
	return (
		<div className="h-3 rounded-xl w-full max-w-md bg-autofun-background-action-disabled relative">
			<div
				className="h-3 rounded-xl bg-autofun-background-action-highlight"
				style={{
					width: `${width}%`,
				}}
			/>
		</div>
	);
};
