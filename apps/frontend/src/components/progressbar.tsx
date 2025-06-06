"use client";
import { cn, getPercentageOfTotal } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function Progressbar({ value, max, height }: { value: number; max: number; height?: string }) {
	const [width, setWidth] = useState<number>(0);

	useEffect(() => {
		setTimeout(() => {
			setWidth(getPercentageOfTotal(value, max));
		}, 10);
	}, [max, value]);

	return (
		<div
			className={cn([
				height ? height : "h-3",
				"rounded-sm w-full max-w-md bg-autofun-background-action-disabled relative overflow-hidden",
			])}
		>
			<div
				className={cn([
					height ? height : "h-3",
					"rounded-sm bg-autofun-background-action-highlight transition-all duration-300",
				])}
				style={{
					width: `${width}%`,
				}}
			/>
		</div>
	);
}
