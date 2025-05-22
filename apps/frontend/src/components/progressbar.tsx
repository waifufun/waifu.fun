"use client";
import { getPercentageOfTotal } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function Progressbar({ value, max }: { value: number; max: number }) {
	const [width, setWidth] = useState<number>(0);

	useEffect(() => {
		setTimeout(() => {
			setWidth(getPercentageOfTotal(value, max));
		}, 10);
	}, [max, value]);

	return (
		<div className="h-3 rounded-xl w-full max-w-md bg-autofun-background-action-disabled relative">
			<div
				className="h-3 rounded-xl bg-autofun-background-action-highlight transition-all duration-300"
				style={{
					width: `${width}%`,
				}}
			/>
		</div>
	);
}
