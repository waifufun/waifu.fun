"use client";
import { abbreviateNumber, cn, fromNow } from "@/lib/utils";
import type { IPresale } from "@autofun/types";
import Image from "next/image";
import Link from "next/link";
import Verified from "../verified";
import { Archive, Star, Timer, Calendar, Target, Users } from "lucide-react";
import Progressbar from "../progressbar";
import { Badge } from "../ui/badge";
import {
	getStatusBadge,
	getCardAccentTheme,
	getAccentColorClasses,
	CARD_BADGE_BASE_CLASSES,
	CARD_BADGE_ICON_CLASSES,
} from "./utils/presale-utils";

const animationLevel = 1;

export const PresaleCard = ({ presale }: { presale: IPresale }) => {
	const cardAccentTheme = getCardAccentTheme(presale);
	const accentColors = getAccentColorClasses(cardAccentTheme);

	const statusInfo = getStatusBadge(presale.status);
	const completionPercentage =
		presale.raise.raisedAmount > 0 ? (presale.raise.raisedAmount / presale.raise.targetAmount) * 100 : 0;

	return (
		<Link
			href={`/incubator/${presale.chain}/${presale.chainId}/${presale.contractAddress}`}
			className={cn([
				"bg-black border group overflow-hidden flex flex-col h-fit break-inside-avoid",
				accentColors.border,
			])}
		>
			<div className="relative">
				{presale?.createdAt ? (
					<div className="absolute top-2 left-2 z-10 flex flex-col items-start">
						<div
							className={cn(
								"flex items-center gap-1 bg-black/75 text-gray-200 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-none shadow-[1px_1px_0px_rgba(3,255,36,0.2)] border",
								accentColors.border,
							)}
						>
							<Timer className={cn("h-2 w-2 sm:h-2.5 sm:w-2.5 pixelated-icon", accentColors.text)} />
							<span>{fromNow(presale?.createdAt, true).toUpperCase()}</span>
						</div>
					</div>
				) : null}

				<div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end z-10">
					<Badge
						className={cn(
							CARD_BADGE_BASE_CLASSES,
							statusInfo.color,
							"shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.3)] sm:shadow-[2px_2px_0px_rgba(0,0,0,0.3)]",
						)}
					>
						{statusInfo.text}
					</Badge>

					{presale?.featured && (
						<Badge
							className={cn(
								CARD_BADGE_BASE_CLASSES,
								"bg-yellow-400 hover:bg-primary/80 text-black shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.7)] sm:shadow-[2px_2px_0px_rgba(0,0,0,0.7)] border border-black",
								animationLevel >= 1 && "animate-badge-glint [animation-delay:0.2s]",
							)}
							style={{ color: "#000000" }}
						>
							<Star className={cn(CARD_BADGE_ICON_CLASSES, "fill-current")} /> FEATURED
						</Badge>
					)}

					{presale?.verified && (
						<Badge
							className={cn(
								CARD_BADGE_BASE_CLASSES,
								"bg-sky-500/90 hover:bg-primary/80 text-black border border-black shadow-[1.5px_1.5px_0px_#01579b] sm:shadow-[2px_2px_0px_#01579b]",
								animationLevel >= 1 && "animate-badge-glint [animation-delay:0.1s]",
							)}
							style={{ color: "#000000" }}
						>
							<Archive className={cn(CARD_BADGE_ICON_CLASSES, "fill-current")} /> VERIFIED
						</Badge>
					)}
				</div>

				<Image
					src={presale.image}
					width={500}
					height={500}
					unoptimized
					alt={presale.name}
					className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
				/>
			</div>

			<div className="flex flex-col gap-2 md:gap-4 p-2 md:p-4">
				<div className="flex flex-col">
					<div className="flex items-center gap-2">
						<span className={cn(["text-lg font-semibold line-clamp-1 truncate", accentColors.text])}>
							{presale?.name}
						</span>
						<Verified isVerified={presale?.verified} />
					</div>
					<div
						className={cn([
							"text-base text-autofun-background-action-highlight font-mono line-clamp-1",
							accentColors.textMuted,
						])}
					>
						${presale?.symbol}
					</div>
				</div>

				<p className="text-gray-400 text-xs line-clamp-2">{presale.description}</p>

				{/* Progress Bar */}
				{completionPercentage > 0 && (
					<div className="space-y-1">
						<div className="flex justify-between items-center text-xs">
							<span className="text-gray-400">Progress:</span>
							<span className={cn("font-semibold", accentColors.text)}>{completionPercentage.toFixed(1)}%</span>
						</div>
						<Progressbar max={100} height="h-2" value={completionPercentage} />
					</div>
				)}

				{/* Stats */}
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="flex items-center gap-1">
						<Target className="h-3 w-3 text-gray-500" />
						<span className="text-gray-400">Target:</span>
						<span className={cn("font-semibold", accentColors.text)}>
							{abbreviateNumber(presale.raise.targetAmount)} {presale.raise.currency}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Users className="h-3 w-3 text-gray-500" />
						<span className="text-gray-400">Participants:</span>
						<span className={cn("font-semibold", accentColors.text)}>{presale.stats.totalParticipants}</span>
					</div>
				</div>

				{/* End Date */}
				{presale.schedule?.endDate && (
					<div className="flex items-center gap-1 text-xs">
						<Calendar className="h-3 w-3 text-gray-500" />
						<span className="text-gray-400">Ends:</span>
						<span className={cn("font-semibold", accentColors.text)}>{fromNow(presale.schedule.endDate, true)}</span>
					</div>
				)}
			</div>
		</Link>
	);
};
