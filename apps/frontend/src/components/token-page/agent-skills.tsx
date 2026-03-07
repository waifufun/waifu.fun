"use client";

import { EvmChainIds, SolanaNetworkIds, type IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { CalendarDays, Globe, Link2, Shield, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn, shortenAddress } from "@/lib/utils";

function HudCorner({ position, size = "sm" }: { position: "tl" | "tr" | "bl" | "br"; size?: "sm" | "md" }) {
	const sizeClass = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";
	const base = `absolute ${sizeClass} pointer-events-none`;
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l border-[#8b5cf6]/30`,
		tr: `${base} top-0 right-0 border-t border-r border-[#8b5cf6]/30`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#8b5cf6]/30`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#8b5cf6]/30`,
	};
	return <span className={styles[position]} />;
}

function formatCreatedAt(
	createdAt?: string,
	options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
) {
	if (!createdAt) {
		return "—";
	}

	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}

	return date.toLocaleDateString("en-US", options).toLowerCase();
}

function getChainLabel(token: IToken) {
	if (token.chain === "solana") {
		return token.chainId === SolanaNetworkIds.Devnet ? "solana devnet" : "solana";
	}

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

export function AgentPersonalityCard({ token }: { token: IToken }) {
	const chainLabel = getChainLabel(token);
	const createdLabel = formatCreatedAt(token.createdAt, { month: "short", year: "numeric" });
	const stats = [
		{ label: "created", value: createdLabel },
		{ label: "holders", value: token.holders.toLocaleString() },
		{ label: "chain", value: chainLabel },
		{ label: "style", value: "—" },
	];

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
			<HudCorner position="tl" size="md" />
			<HudCorner position="tr" size="md" />
			<HudCorner position="bl" size="md" />
			<HudCorner position="br" size="md" />
			<div className="flex items-center justify-between mb-3 gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Zap className="size-3.5 text-[#8b5cf6]" />
					<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">agent personality</span>
				</div>
				<div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#08080a] border border-[#8b5cf6]/20 rounded-sm shrink-0">
					<span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
					<span className="text-[9px] text-[#8b5cf6] font-mono uppercase">{chainLabel}</span>
				</div>
			</div>
			<div className="flex items-start gap-3 mb-3">
				<div className="relative">
					<Image src={token.image} className="w-10 h-10 rounded-sm border border-[#8b5cf6]/20 flex-shrink-0" unoptimized width={40} height={40} alt="agent" />
					<div className="absolute inset-0 bg-[#8b5cf6]/10 blur-md rounded-sm -z-10" />
				</div>
				<div className="flex-1 min-w-0">
					<p
						className={cn(
							"text-xs leading-relaxed line-clamp-2",
							token.description ? "text-[#a1a1aa]" : "text-[#71717a] italic",
						)}
					>
						{token.description || "no description provided"}
					</p>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				{stats.map((stat, index) => (
					<motion.div
						key={stat.label}
						className="relative bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2 hover:border-[rgba(255,255,255,0.12)] transition-colors"
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: index * 0.08 }}
					>
						<div className="text-[9px] text-[#52525b] font-mono uppercase">{stat.label}</div>
						<div className="text-xs text-[#e4e4e7] font-mono lowercase">{stat.value}</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}

export function AgentSkills({ token }: { token: IToken }) {
	const linkedSocials = getLinkedSocialsCount(token);
	const infoItems = [
		{
			label: "holders",
			value: token.holders.toLocaleString(),
			icon: Users,
			accent: "text-[#8b5cf6]",
			glow: "bg-[#8b5cf6]/10",
		},
		{
			label: "linked socials",
			value: linkedSocials.toString(),
			icon: Link2,
			accent: "text-[#c084fc]",
			glow: "bg-[#c084fc]/10",
		},
		{
			label: "created",
			value: formatCreatedAt(token.createdAt),
			icon: CalendarDays,
			accent: "text-[#8b5cf6]",
			glow: "bg-[#8b5cf6]/10",
		},
		{
			label: "chain",
			value: getChainLabel(token),
			icon: Globe,
			accent: "text-[#c084fc]",
			glow: "bg-[#c084fc]/10",
		},
	];

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
			<HudCorner position="tl" size="md" />
			<HudCorner position="tr" size="md" />
			<HudCorner position="bl" size="md" />
			<HudCorner position="br" size="md" />
			<div className="flex items-center gap-2 mb-3">
				<Shield className="size-3.5 text-[#8b5cf6]" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">agent skills</span>
			</div>
			<div className="flex flex-col gap-2">
				{infoItems.map((item, index) => (
					<motion.div
						key={item.label}
						className="relative flex items-center justify-between gap-3 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2.5 hover:border-[rgba(255,255,255,0.12)] transition-all duration-200 group overflow-hidden"
						initial={{ opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: index * 0.08 }}
						whileHover={{ x: 2 }}
					>
						<div className={cn("absolute inset-y-0 left-0 w-10 blur-xl opacity-70", item.glow)} />
						<div className="relative flex items-center gap-2 min-w-0">
							<item.icon className={cn("size-3.5 flex-shrink-0", item.accent)} />
							<span className="text-[11px] text-[#a1a1aa] font-mono lowercase">{item.label}</span>
						</div>
						<span className="relative text-[11px] text-[#e4e4e7] font-mono lowercase text-right">{item.value}</span>
					</motion.div>
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
			<HudCorner position="tl" size="md" />
			<HudCorner position="tr" size="md" />
			<HudCorner position="bl" size="md" />
			<HudCorner position="br" size="md" />
			<div className="flex items-center gap-2 mb-3">
				<Globe className="size-3.5 text-[#a1a1aa]" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">links</span>
			</div>
			<div className="flex items-center gap-2">
				{socials.map((social, i) => {
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
							<motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} whileHover={{ scale: 1.1 }}>
								<Image src={social.icon} className={cn("inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] transition-all duration-200", !social.href ? "opacity-30 cursor-not-allowed" : cn("opacity-70 hover:opacity-100 cursor-pointer", PLATFORM_COLORS[social.title]))} unoptimized width={24} height={24} alt={social.title} />
							</motion.div>
						</Comp>
					);
				})}
			</div>
			<div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
				<div className="text-[9px] text-[#52525b] font-mono uppercase tracking-wider mb-1.5">contract</div>
				<div className="flex items-center justify-between bg-[#08080a] p-2 border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(255,255,255,0.12)] transition-colors group">
					<span className="text-xs text-[#a1a1aa] font-mono truncate group-hover:text-[#e4e4e7] transition-colors">{shortenAddress(token.contractAddress)}</span>
					<CopyButton textToCopy={token.contractAddress} />
				</div>
			</div>
		</div>
	);
}
