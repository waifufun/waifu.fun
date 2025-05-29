"use client";

import Image from "next/image";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export default function Verified({ isVerified }: { isVerified?: boolean | null | undefined }) {
	if (!isVerified) return null;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Image
					src="/verified.svg"
					width={64}
					height={64}
					unoptimized
					id="verified"
					className="size-5 select-none"
					alt="verified_logo"
				/>
			</TooltipTrigger>
			<TooltipContent>
				<span>Verified</span>
			</TooltipContent>
		</Tooltip>
	);
}
