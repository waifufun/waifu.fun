"use client";

import { CopyButton } from "@/components/copy-button";
import { cn, shortenAddress } from "@/lib/utils";
import { EvmChainIds, type IToken } from "@waifufun/types";
import { CalendarDays, Globe, Info, Link2, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { getHolderCountDisplay, hasAggregateHolderCount, isHolderDataIndexed } from "./holder-data-state";

function formatCreatedAt(
	createdAt?: string,
	options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
) {
	if (!createdAt) return "—";
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return "—";
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

function getLinkedSocialsCount(token: IToken) {
	return Object.values(token.socials ?? {}).filter(Boolean).length;
}

export function AgentInfo({ token }: { token: IToken }) {
	const chainLabel = getChainLabel(token);
	const linkedSocials = getLinkedSocialsCount(token);
	const holdersIndexed = isHolderDataIndexed(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);

	const infoItems = [
		{
			label: "contract",
			value: shortenAddress(token.contractAddress),
			icon: Link2,
			accent: "text-[#c084fc]",
			copyValue: token.contractAddress,
		},
		{
			label: "chain",
			value: chainLabel,
			icon: Globe,
			accent: "text-[#c084fc]",
		},
		{
			label: "created",
			value: formatCreatedAt(token.createdAt),
			icon: CalendarDays,
			accent: "text-[#00ff87]",
		},
		{
			label: "linked socials",
			value: linkedSocials.toString(),
			icon: Link2,
			accent: "text-[#c084fc]",
		},
		{
			label: "holders",
			value: getHolderCountDisplay(token),
			icon: Users,
			accent: hasAggregateHolders ? "text-[#00ff87]" : "text-[#71717a]",
			helper: holdersIndexed ? "wallet-level indexed" : hasAggregateHolders ? "aggregate total only" : "not exposed",
		},
	];

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-3 sm:p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors min-w-0">
			<div className="flex items-center gap-2 mb-3 min-w-0">
				<Info className="size-3.5 text-[#00ff87] shrink-0" />
				<span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">agent info</span>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				{infoItems.map((item) => (
					<div
						key={item.label}
						className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-2.5 transition-all duration-200 hover:border-[rgba(255,255,255,0.12)]"
					>
						<div className="relative flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<item.icon className={cn("size-3.5 flex-shrink-0", item.accent)} />
									<span className="text-[11px] text-[#a1a1aa] font-mono lowercase">{item.label}</span>
								</div>
								<span className="mt-2 block truncate text-[11px] font-mono lowercase text-[#e4e4e7]">{item.value}</span>
								{"helper" in item && item.helper ? (
									<span className="mt-1 block text-[10px] font-mono uppercase tracking-[0.14em] text-[#71717a]">
										{item.helper}
									</span>
								) : null}
							</div>
							{item.copyValue && <CopyButton textToCopy={item.copyValue} />}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const PLATFORM_COLORS: Record<string, string> = {
	website: "hover:border-[#a1a1aa] hover:bg-[#a1a1aa]/10 hover:shadow-[0_0_12px_rgba(161,161,170,0.15)]",
	twitter: "hover:border-[#1d9bf0] hover:bg-[#1d9bf0]/10 hover:shadow-[0_0_12px_rgba(29,155,240,0.15)]",
	telegram: "hover:border-[#0088cc] hover:bg-[#0088cc]/10 hover:shadow-[0_0_12px_rgba(0,136,204,0.15)]",
	discord: "hover:border-[#5865f2] hover:bg-[#5865f2]/10 hover:shadow-[0_0_12px_rgba(88,101,242,0.15)]",
};

export function SidebarSocials({ token }: { token: IToken }) {
	const socials = [
		{ title: "website", href: token?.socials?.website, icon: "/socials/website.svg" },
		{ title: "twitter", href: token?.socials?.twitter, icon: "/socials/twitter.svg" },
		{ title: "telegram", href: token?.socials?.telegram, icon: "/socials/telegram.svg" },
		{ title: "discord", href: token?.socials?.discord, icon: "/socials/discord.svg" },
	];
	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
			<div className="flex items-center gap-2 mb-3">
				<Globe className="size-3.5 text-[#a1a1aa]" />
				<span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">links</span>
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
									"inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] transition-all duration-200",
									!social.href
										? "opacity-30 cursor-not-allowed"
										: cn("opacity-70 hover:opacity-100 cursor-pointer", PLATFORM_COLORS[social.title]),
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
			<div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
				<div className="text-[9px] text-[#71717a] font-mono uppercase tracking-wider mb-1.5">contract</div>
				<div className="flex items-center justify-between bg-[#08080a] p-2 border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(255,255,255,0.12)] transition-colors group">
					<span className="text-xs text-[#a1a1aa] font-mono truncate group-hover:text-[#e4e4e7] transition-colors">
						{shortenAddress(token.contractAddress)}
					</span>
					<CopyButton textToCopy={token.contractAddress} />
				</div>
			</div>
		</div>
	);
}
