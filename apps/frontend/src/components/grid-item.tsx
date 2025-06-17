"use client";
import { abbreviateNumber, cn, fromNow } from "@/lib/utils";
import type { IToken } from "@autofun/types";
import Image from "next/image";
import Link from "next/link";
import Verified from "./verified";
import { Archive, Hourglass, Star, Timer } from "lucide-react";
import Progressbar from "./progressbar";
import { Badge } from "./ui/badge";

const animationLevel = 1;

export const GridItem = ({ token }: { token: IToken }) => {
	const useBlueTheme = token?.imported === true;
	const usePurpleTheme = !token?.imported && Number(token?.curveProgress || 0) > 80 && !useBlueTheme;
	const useYellowTheme = token?.featured;
	const cardAccentTheme = useYellowTheme ? "yellow" : usePurpleTheme ? "purple" : useBlueTheme ? "blue" : "green";
	const badgeBaseClasses =
		"font-bold uppercase tracking-wider rounded-none text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1";
	const badgeIconClasses = "h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 pixelated-icon";

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className={cn([
				"bg-black border group overflow-hidden flex flex-col h-fit break-inside-avoid",
				cardAccentTheme === "blue"
					? "border-sky-400/50"
					: cardAccentTheme === "purple"
						? "border-purple-500/50"
						: cardAccentTheme === "yellow"
							? "border-yellow-400/50"
							: "border-[#03FF24]/50",
			])}
		>
			<div className="relative">
				{token?.createdAt ? (
					<div className="absolute top-2 left-2 z-20 flex flex-col items-start">
						<div
							className={cn(
								"flex items-center gap-1 bg-black/75 text-gray-200 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-none shadow-[1px_1px_0px_rgba(3,255,36,0.2)] border",
								cardAccentTheme === "blue"
									? "border-sky-400/50"
									: cardAccentTheme === "purple"
										? "border-purple-500/50"
										: cardAccentTheme === "yellow"
											? "border-yellow-400/50"
											: "border-[#03FF24]/50",
							)}
						>
							<Timer
								className={cn(
									"h-2 w-2 sm:h-2.5 sm:w-2.5 pixelated-icon",
									cardAccentTheme === "blue"
										? "text-sky-400"
										: cardAccentTheme === "purple"
											? "text-purple-500"
											: cardAccentTheme === "yellow"
												? "text-yellow-400"
												: "text-[#03FF24]",
								)}
							/>
							<span>{fromNow(token?.createdAt, true).toUpperCase()}</span>
						</div>
					</div>
				) : null}
				<div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end z-20">
					{token?.imported && !token?.featured ? (
						<Badge
							className={cn(
								badgeBaseClasses,
								"bg-sky-500/90 text-black border border-black shadow-[1.5px_1.5px_0px_#01579b] sm:shadow-[2px_2px_0px_#01579b]",
								animationLevel >= 1 && "animate-badge-glint [animation-delay:0.1s]",
							)}
							style={{ color: "#000000" }}
						>
							<Archive className={cn(badgeIconClasses, "fill-current")} /> IMPORTED
						</Badge>
					) : Number(token?.curveProgress || 0) > 80 && !token?.imported ? (
						<Badge
							className={cn(
								badgeBaseClasses,
								"bg-purple-500 text-white shadow-[1.5px_1.5px_0px_rgba(59,7,100,0.7)] sm:shadow-[2px_2px_0px_rgba(59,7,100,0.7)] border border-purple-700",
								animationLevel >= 1 && "animate-badge-glint",
							)}
						>
							<Hourglass className={cn(badgeIconClasses, animationLevel >= 1 && "animate-spin-slow")} />
							BONDING SOON
						</Badge>
					) : token?.featured ? (
						<Badge
							className={cn(
								badgeBaseClasses,
								"bg-yellow-400 text-black shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.7)] sm:shadow-[2px_2px_0px_rgba(0,0,0,0.7)] border border-black",
								animationLevel >= 1 && "animate-badge-glint [animation-delay:0.2s]",
							)}
							style={{ color: "#000000" }}
						>
							<Star className={cn(badgeIconClasses, "fill-current")} /> FEATURED
						</Badge>
					) : !token?.imported && !token?.featured ? (
						<Badge
							className={cn(
								badgeBaseClasses,
								"bg-black/80 text-[#03FF24] border border-[#03FF24]/50 shadow-[1.5px_1.5px_0px_rgba(3,255,36,0.3)] sm:shadow-[2px_2px_0px_rgba(3,255,36,0.3)] py-0.5 px-1.5 text-[9px] sm:text-[10px]",
							)}
						>
							NEW
						</Badge>
					) : null}
				</div>
				<Image
					src={token.image}
					width={500}
					height={500}
					unoptimized
					alt="image"
					className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
				/>
			</div>
			<div className="flex flex-col gap-4 p-4">
				<div className="flex flex-col">
					<div className="flex items-center gap-2">
						<span
							className={cn([
								"text-lg font-semibold",
								cardAccentTheme === "blue"
									? "text-sky-400"
									: cardAccentTheme === "purple"
										? "text-purple-400"
										: cardAccentTheme === "yellow"
											? "text-yellow-400 filter drop-shadow-[1px_1px_0px_black]"
											: "group-hover:text-[#03FF24]",
							])}
						>
							{token?.name}
						</span>
						<Verified isVerified={token?.verified} />
					</div>
					<div
						className={cn([
							"text-base text-autofun-background-action-highlight font-mono",
							cardAccentTheme === "blue"
								? "text-sky-400/80 group-hover:text-sky-400"
								: cardAccentTheme === "purple"
									? "text-purple-400/80 group-hover:text-purple-400"
									: cardAccentTheme === "yellow"
										? "text-yellow-400/80 group-hover:text-yellow-400"
										: "text-[#03FF24]/70 group-hover:text-[#03FF24]/90",
						])}
					>
						${token?.ticker}
					</div>
				</div>
				<div className="flex justify-between items-center gap-2">
					<span className={cn("text-gray-400 text-[10px] sm:text-[11px]")}>MCAP:</span>
					<div
						className={cn(
							"font-semibold filter drop-shadow-[1px_1px_0px_black] text-sm",
							cardAccentTheme === "blue"
								? "text-sky-400"
								: cardAccentTheme === "purple"
									? "text-purple-400"
									: cardAccentTheme === "yellow"
										? "text-yellow-400"
										: "text-[#03FF24]",
						)}
					>
						{abbreviateNumber(token.marketcap)}
					</div>
				</div>
				{typeof token?.curveProgress === "number" && !token?.imported && !token?.curveCompleted ? (
					<Progressbar max={100} height="h-2.5" value={Number(token.curveProgress.toFixed(2))} />
				) : null}
			</div>
		</Link>
	);
};
