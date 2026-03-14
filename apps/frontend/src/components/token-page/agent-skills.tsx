"use client";

import { CopyButton } from "@/components/copy-button";
import { cn, shortenAddress } from "@/lib/utils";
import { EvmChainIds, type IToken } from "@waifufun/types";
import { CalendarDays, Globe, Link2, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { getHolderCountDisplay, hasAggregateHolderCount, isHolderDataIndexed } from "./holder-data-state";

function formatCreatedAt(
	createdAt?: string,
	options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
) {
	if (!createdAt) return "\u2014";
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return "\u2014";
	return date.toLocaleDateString("en-US", options).toLowerCase();
}

function getChainLabel(token: IToken) {
	switch (token.chainId) {
		case EvmChainIds.BaseMainnet:
			return "base";
		case EvmChainIds.BaseSepolia:
			return "base sepolia";
		case EvmChainIds.EthereumMainnet:
			return "ethereum";
		case EvmChainIds.EthereumSepolia:
			return "ethereum sepolia";
		default:
			return token.chain;
	}
}

type CharacterToken = IToken & {
	agentCharacterConfig?: {
		name?: string;
		bio?: string;
		avatar?: string;
		topics?: string[];
		adjectives?: string[];
		style?: { all?: string[]; chat?: string[]; post?: string[] };
	};
};

function getCharacterData(token: IToken) {
	const ct = token as CharacterToken;
	return ct.agentCharacterConfig ?? null;
}

function InfoRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5">
			<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 shrink-0">{label}</span>
			<span className={cn("text-[11px] font-mono truncate text-right", muted ? "text-zinc-700" : "text-zinc-400")}>
				{value}
			</span>
		</div>
	);
}

export function AgentInfo({ token }: { token: IToken }) {
	const chainLabel = getChainLabel(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);
	const character = getCharacterData(token);

	const hasTopics = character?.topics && character.topics.length > 0;
	const hasAdjectives = character?.adjectives && character.adjectives.length > 0;
	const hasStyle = character?.style?.all && character.style.all.length > 0;
	const hasPersonality = hasTopics || hasAdjectives || hasStyle;

	return (
		<div className="relative rounded-sm border border-white/[0.04] bg-[#111114]/40 p-4 sm:p-5 min-w-0">
			{/* Personality traits — if character data exists */}
			{hasPersonality && (
				<div className="mb-5">
					{hasAdjectives && (
						<div className="mb-4">
							<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 block mb-2">
								personality
							</span>
							<div className="flex flex-wrap gap-1.5">
								{character.adjectives!.slice(0, 8).map((adj) => (
									<span
										key={adj}
										className="rounded-sm border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[10px] font-mono lowercase text-zinc-400"
									>
										{adj}
									</span>
								))}
							</div>
						</div>
					)}

					{hasTopics && (
						<div className="mb-4">
							<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 block mb-2">
								talks about
							</span>
							<div className="flex flex-wrap gap-1.5">
								{character.topics!.slice(0, 6).map((topic) => (
									<span
										key={topic}
										className="rounded-sm border border-[#00ff87]/10 bg-[#00ff87]/[0.03] px-2 py-0.5 text-[10px] font-mono lowercase text-zinc-500"
									>
										{topic}
									</span>
								))}
							</div>
						</div>
					)}

					{hasStyle && (
						<div>
							<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 block mb-2">
								voice
							</span>
							<p className="text-[11px] leading-relaxed text-zinc-500 max-w-md">
								{character.style!.all!.slice(0, 3).join(". ")}.
							</p>
						</div>
					)}

					<div className="mt-4 border-t border-white/[0.03]" />
				</div>
			)}

			{/* Core info — minimal, divided rows */}
			<div className="divide-y divide-white/[0.03]">
				<InfoRow label="chain" value={chainLabel} />
				<InfoRow label="created" value={formatCreatedAt(token.createdAt)} />
				{hasAggregateHolders && (
					<InfoRow label="holders" value={getHolderCountDisplay(token)} />
				)}
				<div className="flex items-center justify-between gap-3 py-1.5">
					<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700 shrink-0">contract</span>
					<div className="flex items-center gap-1.5">
						<span className="text-[11px] font-mono text-zinc-500 truncate">
							{shortenAddress(token.contractAddress)}
						</span>
						<CopyButton textToCopy={token.contractAddress} />
					</div>
				</div>
			</div>
		</div>
	);
}

const PLATFORM_COLORS: Record<string, string> = {
	website: "hover:border-zinc-500 hover:bg-zinc-500/10",
	twitter: "hover:border-[#1d9bf0] hover:bg-[#1d9bf0]/10",
	telegram: "hover:border-[#0088cc] hover:bg-[#0088cc]/10",
	discord: "hover:border-[#5865f2] hover:bg-[#5865f2]/10",
};

export function SidebarSocials({ token }: { token: IToken }) {
	const socials = [
		{ title: "website", href: token?.socials?.website, icon: "/socials/website.svg" },
		{ title: "twitter", href: token?.socials?.twitter, icon: "/socials/twitter.svg" },
		{ title: "telegram", href: token?.socials?.telegram, icon: "/socials/telegram.svg" },
		{ title: "discord", href: token?.socials?.discord, icon: "/socials/discord.svg" },
	];
	return (
		<div className="relative rounded-sm border border-white/[0.04] bg-[#111114]/40 p-4">
			<div className="flex items-center gap-2 mb-3">
				<Globe className="size-3.5 text-zinc-600" />
				<span className="text-[10px] text-zinc-700 font-mono uppercase tracking-wider">links</span>
			</div>
			<div className="flex items-center gap-2">
				{socials.map((social) => {
					const hasLink = !!social.href;
					const Comp = hasLink ? Link : Fragment;
					const compProps: { key: string; href?: string; target?: string } = { key: social.title };
					if (hasLink && social.href) {
						compProps.href = social.href;
						compProps.target = "_blank";
					}
					return (
						// @ts-ignore
						<Comp {...compProps} key={social.title}>
							<Image
								src={social.icon}
								className={cn(
									"inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-sm border border-white/[0.06] bg-white/[0.02] transition-all duration-200",
									!social.href
										? "opacity-20 cursor-not-allowed"
										: cn("opacity-50 hover:opacity-100 cursor-pointer", PLATFORM_COLORS[social.title]),
								)}
								unoptimized
								width={24}
								height={24}
								alt={social.title}
							/>
						</Comp>
					);
				})}
			</div>
			<div className="mt-3 pt-3 border-t border-white/[0.03]">
				<div className="text-[9px] text-zinc-700 font-mono uppercase tracking-wider mb-1.5">contract</div>
				<div className="flex items-center justify-between bg-[#08080a] p-2 border border-white/[0.04] rounded-sm group">
					<span className="text-xs text-zinc-500 font-mono truncate group-hover:text-zinc-400 transition-colors">
						{shortenAddress(token.contractAddress)}
					</span>
					<CopyButton textToCopy={token.contractAddress} />
				</div>
			</div>
		</div>
	);
}
