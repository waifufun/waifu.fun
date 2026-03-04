"use client";
import { abbreviateNumber, cn } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";
import Progressbar from "./progressbar";

export const GridItem = ({ token }: { token: IToken }) => {
	const useBlueTheme = token?.imported === true;
	const useMigratingTheme = token?.status === "migrating";
	const useMigratedTheme = token?.status === "migrated" || token?.status === "finalized";

	// Agent state: alive = bonded and running, dead = finalized/failed
	const isAgentAlive =
		(token?.curveCompleted || Number(token?.curveProgress || 0) >= 100) &&
		token?.status !== "finalized" &&
		token?.status !== "failed";
	const isAgentDead = token?.status === "finalized" || token?.status === "failed";
	const agentState = isAgentDead ? "dead" : isAgentAlive ? "alive" : "neutral";

	const usePurpleTheme =
		!token?.imported &&
		(token?.curveCompleted || Number(token?.curveProgress || 0) >= 100) && // Updated condition for bonded tokens
		!useBlueTheme &&
		!useMigratingTheme &&
		!useMigratedTheme;
	const useYellowTheme = token?.featured;
	const cardAccentTheme = useYellowTheme
		? "yellow"
		: useMigratingTheme
			? "migrating"
			: useMigratedTheme
				? "migrated"
				: usePurpleTheme
					? "purple"
					: useBlueTheme
						? "blue"
						: "green";

	const glassStyles =
		agentState === "alive"
			? "bg-green-400/25 backdrop-blur-md border border-green-400/50 hover:border-green-400/70"
			: agentState === "dead"
				? "bg-red-500/25 backdrop-blur-md border border-red-400/50 hover:border-red-500/70"
				: "bg-white/30 backdrop-blur-md border border-white/50";

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className={cn([
				"group overflow-hidden flex flex-col h-full min-h-0 rounded-xl",
				glassStyles,
				agentState === "neutral" &&
					(cardAccentTheme === "blue"
						? "hover:border-sky-400/60"
						: cardAccentTheme === "purple"
							? "hover:border-purple-500/60"
							: cardAccentTheme === "yellow"
								? "hover:border-yellow-400/60"
								: cardAccentTheme === "migrating"
									? "hover:border-orange-400/60"
									: cardAccentTheme === "migrated"
										? "hover:border-purple-500/60"
										: "hover:border-[#03FF24]/60"),
			])}
		>
			<div className="relative aspect-square w-full shrink-0">
				<Image
					src={token.image}
					width={500}
					height={500}
					unoptimized
					alt="image"
					className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
				/>
			</div>
			<div className="flex flex-col gap-2 flex-1 min-h-0 p-4">
				<div className="flex flex-col">
					<span className="text-sm font-medium text-gray-900 line-clamp-1 truncate">
						{token?.name}
					</span>
					<span className="text-sm font-medium text-gray-700 line-clamp-1">
						${token?.ticker}
					</span>
				</div>
				<div className="text-sm font-medium text-gray-900">
					{abbreviateNumber(token.marketcap)}
				</div>
				{typeof token?.curveProgress === "number" &&
				!token?.imported &&
				!token?.curveCompleted &&
				token?.status !== "migrating" ? (
					<Progressbar max={100} height="h-2.5" value={Number(token.curveProgress.toFixed(2))} />
				) : null}
			</div>
		</Link>
	);
};
