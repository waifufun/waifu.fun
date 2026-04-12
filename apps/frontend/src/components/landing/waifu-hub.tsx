"use client";

import { motion } from "framer-motion";
import {
	TrendingUp,
	Lock,
	Percent,
	Bot,
	Activity,
	Coins,
	Rocket,
	ArrowRight,
} from "lucide-react";
import Link from "next/link";

const EASE = [0.22, 1, 0.36, 1] as const;

interface StatCellProps {
	icon: React.ReactNode;
	label: string;
	value: string;
	sub?: string;
	accent?: boolean;
	pulse?: boolean;
	delay?: number;
}

function StatCell({ icon, label, value, sub, accent, pulse, delay = 0 }: StatCellProps) {
	return (
		<motion.div
			className="group relative flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-4"
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5, ease: EASE, delay }}
		>
			<div className="flex items-center gap-2">
				<span className="text-[#52525b] transition-colors duration-200 group-hover:text-[#71717a]">
					{icon}
				</span>
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#52525b]">
					{label}
				</span>
			</div>

			<div className="flex items-baseline gap-2">
				<span
					className={`text-xl font-mono font-semibold tracking-tight sm:text-2xl ${
						accent ? "text-[#00ff87]" : "text-[#e4e4e7]"
					}`}
				>
					{value}
				</span>
				{pulse && (
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff87] opacity-40" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff87]" />
					</span>
				)}
			</div>

			{sub && (
				<span className="text-[11px] font-mono text-[#3f3f46]">{sub}</span>
			)}
		</motion.div>
	);
}

function HubLink({
	href,
	children,
	delay = 0,
}: {
	href: string;
	children: React.ReactNode;
	delay?: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.4, ease: EASE, delay }}
		>
			<Link
				href={href}
				className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-[#52525b] transition-colors duration-200 hover:text-[#00ff87]"
			>
				{children}
				<ArrowRight className="h-3 w-3" />
			</Link>
		</motion.div>
	);
}

const WAIFU_STATS = [
	{
		icon: <TrendingUp className="h-3.5 w-3.5" />,
		label: "WAIFU Price",
		value: "$0.0042",
		pulse: true,
		accent: true,
	},
	{
		icon: <Coins className="h-3.5 w-3.5" />,
		label: "Market Cap",
		value: "$4.2M",
	},
	{
		icon: <Lock className="h-3.5 w-3.5" />,
		label: "Total Staked",
		value: "42%",
		sub: "of circulating supply",
	},
	{
		icon: <Percent className="h-3.5 w-3.5" />,
		label: "Staking APY",
		value: "12.5%",
		accent: true,
	},
] as const;

const AGENT_STATS = [
	{
		icon: <Bot className="h-3.5 w-3.5" />,
		label: "Active Agents",
		value: "7",
		pulse: true,
	},
	{
		icon: <Activity className="h-3.5 w-3.5" />,
		label: "Volume 24h",
		value: "$128K",
	},
	{
		icon: <Coins className="h-3.5 w-3.5" />,
		label: "Fees Distributed",
		value: "$18.4K",
		sub: "all time",
	},
	{
		icon: <Rocket className="h-3.5 w-3.5" />,
		label: "Graduated",
		value: "2",
		sub: "to PancakeSwap",
	},
] as const;

export default function WaifuHub() {
	return (
		<section className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-10">
			<div className="relative overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(10,10,14,0.8)] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-xl">
				{/* top edge highlight */}
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.2)] to-transparent" />

				{/* subtle radial glow */}
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(0,255,135,0.04),transparent_60%)]" />

				<div className="relative">
					{/* Row 1: WAIFU token */}
					<div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
						<div className="mb-3 flex items-center justify-between">
							<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#3f3f46]">
								WAIFU Token
							</span>
							<HubLink href="/stake" delay={0.3}>
								View Staking
							</HubLink>
						</div>

						<div className="grid grid-cols-2 gap-px sm:grid-cols-4">
							{WAIFU_STATS.map((stat, i) => (
								<StatCell
									key={stat.label}
									{...stat}
									delay={0.08 * i}
								/>
							))}
						</div>
					</div>

					{/* divider */}
					<div className="mx-4 sm:mx-6">
						<div className="h-px w-full bg-[rgba(255,255,255,0.05)]" />
					</div>

					{/* Row 2: Agent economy */}
					<div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
						<div className="mb-3 flex items-center justify-between">
							<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#3f3f46]">
								Agent Economy
							</span>
							<HubLink href="/create" delay={0.5}>
								Launch Agent
							</HubLink>
						</div>

						<div className="grid grid-cols-2 gap-px sm:grid-cols-4">
							{AGENT_STATS.map((stat, i) => (
								<StatCell
									key={stat.label}
									{...stat}
									delay={0.25 + 0.08 * i}
								/>
							))}
						</div>
					</div>
				</div>

				{/* bottom edge highlight */}
				<div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.1)] to-transparent" />
			</div>
		</section>
	);
}
