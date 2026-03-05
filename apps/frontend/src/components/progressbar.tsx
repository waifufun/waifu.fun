"use client";
import { cn, getPercentageOfTotal } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function Progressbar({ value, max, height }: { value: number; max: number; height?: string }) {
	const [percentage, setPercentage] = useState<number>(0);

	useEffect(() => {
		setTimeout(() => {
			const pct = getPercentageOfTotal(value, max);
			setPercentage(pct);
		}, 10);
	}, [max, value]);

	return (
		<div className={cn([height ? height : "h-3", "w-full max-w-md"])}>
			<div className="h-full w-full bg-[rgba(139,92,246,0.1)] rounded-full overflow-hidden border border-[rgba(255,255,255,0.06)]">
				<div
					className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] via-[#8b5cf6] to-[#c084fc] transition-all duration-700 ease-out shadow-[0_0_8px_rgba(139,92,246,0.4)]"
					style={{ width: `${Math.min(percentage, 100)}%` }}
				/>
			</div>
		</div>
	);
}
