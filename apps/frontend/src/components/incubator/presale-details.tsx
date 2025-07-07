"use client";
import { abbreviateNumber, cn, fromNow } from "@/lib/utils";
import type { IPresale } from "@autofun/types";
import Image from "next/image";
import Verified from "../verified";
import { Archive, Star, Target, Users, TrendingUp, Clock, ExternalLink, Share2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import PresaleSwap from "./presale-swap";
import { getStatusBadge, BADGE_BASE_CLASSES, BADGE_ICON_CLASSES } from "./utils/presale-utils";

export default function PresaleDetails({ presale }: { presale: IPresale }) {


	const statusInfo = getStatusBadge(presale.status);
	const completionPercentage =
		presale.raise.raisedAmount > 0 ? (presale.raise.raisedAmount / presale.raise.targetAmount) * 100 : 0;

	const canParticipate = presale.status === "active";

	return (
		<div className="space-y-6">
			<div className="flex flex-col lg:flex-row gap-6">
				{/* Header Section */}
				<div className="relative lg:w-1/2">
					<div className="aspect-video w-full overflow-hidden rounded-lg">
						<Image
							src={presale.image}
							width={1200}
							height={675}
							unoptimized
							alt={presale.name}
							className="w-full h-full object-cover"
						/>
					</div>

					<div className="absolute top-4 right-4 flex flex-col gap-2">
						<Badge className={cn(BADGE_BASE_CLASSES, statusInfo.color)}>{statusInfo.text}</Badge>

						{presale?.featured && (
							<Badge className={cn(BADGE_BASE_CLASSES, "bg-yellow-400 text-black border-black")}>
								<Star className={cn(BADGE_ICON_CLASSES, "fill-current")} /> FEATURED
							</Badge>
						)}

						{presale?.verified && (
							<Badge className={cn(BADGE_BASE_CLASSES, "bg-sky-500/90 text-black border-black")}>
								<Archive className={cn(BADGE_ICON_CLASSES, "fill-current")} /> VERIFIED
							</Badge>
						)}
					</div>
				</div>

				{/* Title and Basic Info */}
				<div className="flex flex-col lg:w-1/2">
					<div className="flex-1">
						<div className="flex items-center gap-3 mb-2">
							<h1 className="text-3xl font-bold text-[#03FF23]">{presale.name}</h1>
							<Verified isVerified={presale?.verified} />
						</div>
						<p className="text-2xl font-mono text-[#03FF23]/70 mb-4">${presale.symbol}</p>
						<p className="text-gray-300 text-lg leading-relaxed max-w-3xl">{presale.description}</p>
					</div>

					<div className="flex flex-col gap-3 min-w-fit mt-4 lg:mt-auto">
						<Button variant="outline" size="lg" className="border-[#03FF23]/50 text-[#03FF23] hover:bg-[#03FF23]/10">
							<Share2 className="h-4 w-4 mr-2" />
							Share
						</Button>
					</div>
				</div>
			</div>

			{/* PresaleSwap */}
			<div className="block md:hidden w-full mb-4">
				<PresaleSwap presale={presale} />
			</div>

			<div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
				<Card className="bg-black border-[#03FF23]/20">
					<CardContent className="p-4">
						<div className="flex items-center gap-2 mb-2">
							<Target className="h-5 w-5 text-[#03FF23]" />
							<span className="text-gray-400 text-sm">Target</span>
						</div>
						<p className="text-xl font-bold text-[#03FF23]">
							{abbreviateNumber(presale.raise.targetAmount)} {presale.raise.currency}
						</p>
					</CardContent>
				</Card>

				<Card className="bg-black border-[#03FF23]/20">
					<CardContent className="p-4">
						<div className="flex items-center gap-2 mb-2">
							<TrendingUp className="h-5 w-5 text-[#03FF23]" />
							<span className="text-gray-400 text-sm">Raised</span>
						</div>
						<p className="text-xl font-bold text-[#03FF23]">
							{abbreviateNumber(presale.raise.raisedAmount)} {presale.raise.currency}
						</p>
					</CardContent>
				</Card>

				<Card className="bg-black border-[#03FF23]/20">
					<CardContent className="p-4">
						<div className="flex items-center gap-2 mb-2">
							<Users className="h-5 w-5 text-[#03FF23]" />
							<span className="text-gray-400 text-sm">Participants</span>
						</div>
						<p className="text-xl font-bold text-[#03FF23]">{presale.stats.totalParticipants}</p>
					</CardContent>
				</Card>

				<Card className="bg-black border-[#03FF23]/20">
					<CardContent className="p-4">
						<div className="flex items-center gap-2 mb-2">
							<Clock className="h-5 w-5 text-[#03FF23]" />
							<span className="text-gray-400 text-sm">Ends</span>
						</div>
						<p className="text-xl font-bold text-[#03FF23]">{fromNow(presale.schedule.endDate, true)}</p>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col-reverse md:flex-row gap-4 md:gap-6 w-full">
				<div className="flex-1 flex flex-col gap-4 md:gap-6">
					<Card className="bg-black border-[#03FF23]/20">
						<CardHeader>
							<CardTitle className="text-[#03FF23] text-base md:text-lg">Tokenomics</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
								<div className="space-y-3">
									<h4 className="text-base md:text-lg font-semibold text-gray-200">Allocations</h4>
									<div className="space-y-2">
										<div className="flex justify-between">
											<span className="text-gray-400">Presale</span>
											<span className="text-[#03FF23]">{presale.tokenomics.presaleAllocation}%</span>
										</div>
										<div className="flex justify-between">
											<span className="text-gray-400">Liquidity</span>
											<span className="text-[#03FF23]">{presale.tokenomics.liquidityAllocation}%</span>
										</div>
										<div className="flex justify-between">
											<span className="text-gray-400">Team</span>
											<span className="text-[#03FF23]">{presale.tokenomics.teamAllocation}%</span>
										</div>
										{presale.tokenomics.marketingAllocation > 0 && (
											<div className="flex justify-between">
												<span className="text-gray-400">Marketing</span>
												<span className="text-[#03FF23]">{presale.tokenomics.marketingAllocation}%</span>
											</div>
										)}
									</div>
								</div>

								<div className="space-y-3">
									<h4 className="text-base md:text-lg font-semibold text-gray-200">Token Details</h4>
									<div className="space-y-2">
										<div className="flex justify-between">
											<span className="text-gray-400">Total Supply</span>
											<span className="text-[#03FF23]">{abbreviateNumber(presale.totalSupply)}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-gray-400">Decimals</span>
											<span className="text-[#03FF23]">{presale.decimals}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-gray-400">Price per Token</span>
											<span className="text-[#03FF23]">
												{presale.raise.pricePerToken} {presale.raise.currency}
											</span>
										</div>
										{presale.tokenomics.vestingSchedule && (
											<div className="flex justify-between">
												<span className="text-gray-400">Vesting</span>
												<span className="text-[#03FF23]">Scheduled</span>
											</div>
										)}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
					{presale.utility && (
						<Card className="bg-black border-[#03FF23]/20">
							<CardHeader>
								<CardTitle className="text-[#03FF23]">Utility</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<p className="text-gray-300">{presale.utility.description}</p>

								{presale.utility.features && presale.utility.features.length > 0 && (
									<div>
										<h4 className="text-lg font-semibold text-gray-200 mb-2">Features</h4>
										<div className="flex flex-wrap gap-2">
											{presale.utility.features.map((feature) => (
												<Badge key={feature} variant="outline" className="border-[#03FF23]/50 text-[#03FF23]">
													{feature}
												</Badge>
											))}
										</div>
									</div>
								)}

								{presale.utility.useCases && presale.utility.useCases.length > 0 && (
									<div>
										<h4 className="text-lg font-semibold text-gray-200 mb-2">Use Cases</h4>
										<div className="flex flex-wrap gap-2">
											{presale.utility.useCases.map((useCase) => (
												<Badge key={useCase} variant="outline" className="border-[#03FF23]/50 text-[#03FF23]">
													{useCase}
												</Badge>
											))}
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}
					{presale.team && (
						<Card className="bg-black border-[#03FF23]/20">
							<CardHeader>
								<CardTitle className="text-[#03FF23]">Team</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-gray-300 mb-4">{presale.team.description}</p>
								{presale.team.members && presale.team.members.length > 0 && (
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
										{presale.team.members.map((member) => (
											<div key={member.name} className="text-center p-4 border border-[#03FF23]/20 rounded-lg">
												<h4 className="font-semibold text-[#03FF23]">{member.name}</h4>
												<p className="text-gray-400 text-sm">{member.role}</p>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					)}
					{presale.socials && Object.keys(presale.socials).length > 0 && (
						<Card className="bg-black border-[#03FF23]/20">
							<CardHeader>
								<CardTitle className="text-[#03FF23]">Social Links</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex flex-wrap gap-3">
									{Object.entries(presale.socials).map(([platform, url]) => (
										<a
											key={platform}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-2 px-4 py-2 border border-[#03FF23]/50 text-[#03FF23] hover:bg-[#03FF23]/10 rounded-lg transition-colors"
										>
											<ExternalLink className="h-4 w-4" />
											{platform.charAt(0).toUpperCase() + platform.slice(1)}
										</a>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>
				<div className="hidden md:block md:w-[400px] w-full mb-4 md:mb-0">
					<PresaleSwap presale={presale} />
				</div>
			</div>
		</div>
	);
}
