"use client";
import { cn, getPercentageOfTotal } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function Progressbar({ value, max, height }: { value: number; max: number; height?: string }) {
	const [width, setWidth] = useState<number>(0);

	useEffect(() => {
		setTimeout(() => {
			const percentage = getPercentageOfTotal(value, max);
			const maxCubes = 20;
			const renderCubes = Math.round((maxCubes / 100) * percentage);
			setWidth(renderCubes);
		}, 10);
	}, [max, value]);

	return (
		<div className={cn([height ? height : "h-3", "w-full max-w-md"])}>
			<div className="h-full grid grid-cols-[repeat(20,minmax(0,1fr))] gap-px w-full border bg-black/50 p-0.5 rounded-none shadow-inner border-[#00FF87]/30">
				{Array(20)
					.fill("A")
					.map((_, idx) => (
						<div
							className={cn([
								idx < width ? "flashy-bonding-block" : "bg-gray-500",
								"h-full relative overflow-hidden transition-colors duration-300",
							])}
							// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
							key={idx}
							style={{ animationDelay: "0s" }}
						/>
					))}
			</div>
		</div>
	);
}
