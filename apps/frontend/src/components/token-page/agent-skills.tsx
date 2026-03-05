"use client";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import { Fragment } from "react";
import Link from "next/link";
import { cn, shortenAddress } from "@/lib/utils";
import { Brain, Globe, LineChart, PieChart, MessageCircle, Zap, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { CopyButton } from "@/components/copy-button";

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const base = "absolute w-2.5 h-2.5 pointer-events-none";
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l border-[#00ff87]/30`,
		tr: `${base} top-0 right-0 border-t border-r border-[#00ff87]/30`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#00ff87]/30`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#00ff87]/30`,
	};
	return <span className={styles[position]} />;
}

const MOCK_SKILLS = [
	{ label: "defi trading", icon: LineChart, color: "text-[#00ff87]" },
	{ label: "market analysis", icon: Brain, color: "text-[#c084fc]" },
	{ label: "portfolio mgmt", icon: PieChart, color: "text-[#22c55e]" },
	{ label: "social intel", icon: MessageCircle, color: "text-[#a1a1aa]" },
];

export function AgentPersonalityCard({ token }: { token: IToken }) {
	const tradingStyles = ["aggressive", "conservative", "balanced"];
	const mockStyle = tradingStyles[Math.abs(token.name.length) % 3];
	const activeSince = token.createdAt ? new Date(token.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "jan 2025";

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4">
			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />

			<div className="flex items-center gap-2 mb-3">
				<Zap className="size-3.5 text-[#00ff87]" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
					agent personality
				</span>
			</div>

			<div className="flex items-start gap-3 mb-3">
				<Image
					src={token.image}
					className="w-10 h-10 rounded-sm border border-[#00ff87]/20 flex-shrink-0"
					unoptimized
					width={40}
					height={40}
					alt="agent"
				/>
				<p className="text-xs text-[#a1a1aa] leading-relaxed line-clamp-3">
					{token.description || "a versatile ai agent designed to navigate the complexities of decentralized finance with precision and adaptability."}
				</p>
			</div>

			<div className="grid grid-cols-3 gap-2">
				<div className="bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2">
					<div className="text-[9px] text-[#52525b] font-mono uppercase">style</div>
					<div className="text-xs text-[#e4e4e7] font-mono">{mockStyle}</div>
				</div>
				<div className="bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2">
					<div className="text-[9px] text-[#52525b] font-mono uppercase">active since</div>
					<div className="text-xs text-[#e4e4e7] font-mono lowercase">{activeSince}</div>
				</div>
				<div className="bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2">
					<div className="text-[9px] text-[#52525b] font-mono uppercase">trades</div>
					<div className="text-xs text-[#e4e4e7] font-mono">{(token.holders || 42) * 7}</div>
				</div>
			</div>
		</div>
	);
}

export function AgentSkills() {
	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4">
			<div className="flex items-center gap-2 mb-3">
				<Shield className="size-3.5 text-[#22c55e]" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
					agent skills
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2">
				{MOCK_SKILLS.map((skill) => (
					<motion.div
						key={skill.label}
						className="flex items-center gap-2 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-2.5 hover:border-[#00ff87]/20 transition-colors duration-200"
						whileHover={{ scale: 1.02 }}
						transition={{ type: "spring", stiffness: 400 }}
					>
						<skill.icon className={cn("size-3.5 flex-shrink-0", skill.color)} />
						<span className="text-[11px] text-[#a1a1aa] font-mono lowercase">
							{skill.label}
						</span>
					</motion.div>
				))}
			</div>
		</div>
	);
}

export function SidebarSocials({ token }: { token: IToken }) {
	const socials = [
		{ title: "website", href: token?.socials?.website, icon: "/socials/website.svg" },
		{ title: "twitter", href: token?.socials?.twitter, icon: "/socials/twitter.svg" },
		{ title: "telegram", href: token?.socials?.telegram, icon: "/socials/telegram.svg" },
		{ title: "discord", href: token?.socials?.discord, icon: "/socials/discord.svg" },
	];

	return (
		<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4">
			<div className="flex items-center gap-2 mb-3">
				<Globe className="size-3.5 text-[#a1a1aa]" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
					links
				</span>
			</div>

			<div className="flex items-center gap-2">
				{socials.map((social) => {
					const hasLink = !!social.href;
					const Comp = hasLink ? Link : Fragment;
					const compProps: { key: string; href?: string; target?: string } = {
						key: social.title,
					};
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
									"inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#00ff87] hover:bg-[#00ff87]/10 transition-all duration-200",
									!social.href
										? "opacity-30 cursor-not-allowed"
										: "opacity-70 hover:opacity-100 cursor-pointer",
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

			{/* contract address */}
			<div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
				<div className="text-[9px] text-[#52525b] font-mono uppercase tracking-wider mb-1.5">
					contract
				</div>
				<div className="flex items-center justify-between bg-[#08080a] p-2 border border-[rgba(255,255,255,0.06)] rounded-sm">
					<span className="text-xs text-[#a1a1aa] font-mono truncate">
						{shortenAddress(token.contractAddress)}
					</span>
					<CopyButton textToCopy={token.contractAddress} />
				</div>
			</div>
		</div>
	);
}
