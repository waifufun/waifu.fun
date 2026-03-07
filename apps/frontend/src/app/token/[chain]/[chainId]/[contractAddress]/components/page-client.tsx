"use client";

import BondingCurveProgress from "@/components/bonding-curve-progress";
import Chart from "@/components/chart/chart";
import ClaimFees from "@/components/claim-fees";
import ScamWarning from "@/components/scam-notice";
import Swap from "@/components/swap";
import ActivityFeed from "@/components/token-page/activity-feed";
import AgentProfile, { deriveAgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { AgentPersonalityCard, AgentSkills, SidebarSocials } from "@/components/token-page/agent-skills";
import AgentStatusVisual from "@/components/token-page/agent-status-visual";
import Chat from "@/components/token-page/chat";
import OwnerRuntimePanel from "@/components/token-page/owner-runtime-panel";
import TokenTabs from "@/components/token-page/token-tabs";
import { Button } from "@/components/ui/button";
import useAddress from "@/hooks/use-address";
import { getToken } from "@/lib/api";
import { cn, isSameWalletAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, MessageCircle, TrendingUp } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import UpdateSocialsModal from "./UpdateSocialsModal";

function HudCorner({ position, color = "green" }: { position: "tl" | "tr" | "bl" | "br"; color?: "green" | "purple" }) {
	const base = "absolute w-2.5 h-2.5 pointer-events-none";
	const borderColor = color === "green" ? "border-[#00ff87]/30" : "border-[#c084fc]/30";
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l ${borderColor}`,
		tr: `${base} top-0 right-0 border-t border-r ${borderColor}`,
		bl: `${base} bottom-0 left-0 border-b border-l ${borderColor}`,
		br: `${base} bottom-0 right-0 border-b border-r ${borderColor}`,
	};
	return <span className={styles[position]} />;
}

const TIMEFRAMES = [
	{ label: "1h", value: "1h" },
	{ label: "4h", value: "4h" },
	{ label: "1d", value: "1d" },
	{ label: "1w", value: "1w" },
	{ label: "all", value: "all" },
];

function getBadgeInfo(token: IToken, isImported: boolean) {
	if (token?.status === "migrating") {
		return {
			badge: "MIGRATING",
			classes: "bg-orange-400/80 hover:bg-orange-400/50 text-white border border-orange-400/50",
		};
	}

	if (token?.status === "migrated" || token?.status === "locked") {
		return {
			badge: "BONDED",
			classes:
				"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 shadow-[0_0_8px_rgba(0,255,135,0.2)] py-0.5 px-1.5 text-[9px] sm:text-[10px]",
		};
	}

	if (isImported) {
		return {
			badge: "IMPORTED",
			classes:
				"bg-sky-500/15 hover:bg-sky-500/25 text-[#60a5fa] border border-sky-500/40 shadow-[0_0_10px_rgba(96,165,250,0.16)] py-0.5 px-1.5 text-[9px] sm:text-[10px]",
		};
	}

	return {
		badge: "ACTIVE",
		classes:
			"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 py-0.5 px-1.5 text-[9px] sm:text-[10px]",
	};
}

export default function PageClient({
	initialData,
	tokenParams,
	children,
}: { initialData: IToken; children: ReactNode; tokenParams: ITokenLookUp }) {
	const query = useQuery({
		queryKey: ["token", initialData.chain, initialData.chainId, initialData.contractAddress],
		queryFn: async () => {
			try {
				const token = (await getToken(tokenParams)) as IToken;
				return token;
			} catch (error) {
				console.warn("API fetch failed, using initial data:", error);
				return initialData;
			}
		},
		refetchInterval: process.env.NEXT_PUBLIC_API_URL ? 5_000 : false,
		initialData,
	});

	const currentAddress = useAddress();
	const token = query.data ?? initialData;
	const agentStatus = useMemo(() => deriveAgentLifecycleStatus(token), [token]);
	const isCreator = useMemo(() => {
		if (currentAddress && token?.creator) {
			return isSameWalletAddress(currentAddress, token.creator);
		}
		return false;
	}, [currentAddress, token?.creator]);
	const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
	const [activePanel, setActivePanel] = useState<"chart" | "chat">("chart");
	const [socialsModalOpen, setSocialsModalOpen] = useState(false);
	const panelSectionRef = useRef<HTMLDivElement | null>(null);
	const [shouldScrollToChat, setShouldScrollToChat] = useState(false);
	const isPriceUp = true;
	const badge = getBadgeInfo(token, agentStatus.isImported);

	useEffect(() => {
		if (activePanel === "chat" && shouldScrollToChat) {
			panelSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			setShouldScrollToChat(false);
		}
	}, [activePanel, shouldScrollToChat]);

	const handleOpenChat = () => {
		setShouldScrollToChat(true);
		setActivePanel("chat");
	};
	const badgeBaseClasses =
		"font-bold uppercase tracking-wider rounded-sm text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1";

	return (
		<div className="flex flex-col gap-5 mt-3 container">
			<ScamWarning isHidden={!!token?.hidden} />
			<AgentProfile
				token={token}
				status={agentStatus}
				badge={badge}
				badgeBaseClasses={badgeBaseClasses}
				onOpenChat={handleOpenChat}
			/>
			<AgentStatusVisual status={agentStatus} />

			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-5">
				<div className="w-full lg:w-[65%] flex flex-col gap-5 order-3 lg:order-2">
					<div
						ref={panelSectionRef}
						className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm"
					>
						<div className="inline-flex items-center gap-1 rounded-sm bg-[#08080a] border border-[rgba(255,255,255,0.06)] p-1">
							{(
								[
									{ id: "chart", label: "chart", Icon: BarChart3 },
									{ id: "chat", label: "chat", Icon: MessageCircle },
								] as const
							).map(({ id, label, Icon }) => {
								const isActive = activePanel === id;

								return (
									<button
										key={id}
										type="button"
										onClick={() => setActivePanel(id)}
										className={cn(
											"inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] transition-all duration-200",
											isActive
												? "bg-[#111114] text-[#00ff87] border border-[#00ff87]/30 shadow-[0_0_12px_rgba(0,255,135,0.12)]"
												: "border border-transparent bg-transparent text-[#52525b] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)]",
										)}
									>
										<Icon className="size-3.5" />
										<span>{label}</span>
									</button>
								);
							})}
						</div>

						<span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-[#52525b] font-mono uppercase tracking-[0.2em]">
							{activePanel === "chart" ? (
								<>
									<BarChart3 className="size-3 text-[#00ff87]" />
									price panel
								</>
							) : (
								<>
									<MessageCircle className="size-3 text-[#00ff87]" />
									community channel live
								</>
							)}
						</span>
					</div>

					<AnimatePresence mode="wait" initial={false}>
						{activePanel === "chart" ? (
							<motion.div
								key="chart-panel"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
							>
								<motion.div
									className={cn(
										"relative bg-[#111114] border rounded-sm overflow-hidden transition-all duration-500",
										isPriceUp
											? "border-[#00ff87]/20 shadow-[0_0_20px_rgba(0,255,135,0.05)]"
											: "border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]",
									)}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
								>
									<HudCorner position="tl" color={isPriceUp ? "green" : "purple"} />
									<HudCorner position="tr" color={isPriceUp ? "green" : "purple"} />
									<HudCorner position="bl" color={isPriceUp ? "green" : "purple"} />
									<HudCorner position="br" color={isPriceUp ? "green" : "purple"} />

									<div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
										<div className="flex items-center gap-2">
											<BarChart3 className={cn("size-4", isPriceUp ? "text-[#00ff87]" : "text-red-400")} />
											<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">price chart</span>
											{isPriceUp ? (
												<TrendingUp className="size-3 text-[#00ff87]" />
											) : (
												<TrendingUp className="size-3 text-red-400 rotate-180" />
											)}
										</div>

										<div className="flex items-center gap-1">
											{TIMEFRAMES.map((timeframe) => (
												<button
													key={timeframe.value}
													type="button"
													onClick={() => setSelectedTimeframe(timeframe.value)}
													className={cn(
														"px-2 py-1 text-[10px] font-mono uppercase rounded-sm transition-all duration-200",
														selectedTimeframe === timeframe.value
															? "bg-[#00ff87]/10 text-[#00ff87] border border-[#00ff87]/30"
															: "text-[#52525b] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)] border border-transparent",
													)}
												>
													{timeframe.label}
												</button>
											))}
										</div>
									</div>

									<div className="p-3">
										<Chart token={token} />
									</div>
									<div
										className={cn(
											"absolute bottom-0 left-0 right-0 h-1 blur-sm",
											isPriceUp ? "bg-[#00ff87]/20" : "bg-red-500/20",
										)}
									/>
								</motion.div>
							</motion.div>
						) : (
							<motion.div
								key="chat-panel"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
								className="[&>div]:h-[580px] lg:[&>div]:h-[620px]"
							>
								<Chat token={token} />
							</motion.div>
						)}
					</AnimatePresence>

					<ActivityFeed token={token} />

					<div className="flex flex-col gap-4">
						<TokenTabs token={token} />
						{children}
					</div>
				</div>

				<div className="w-full lg:w-[35%] flex flex-col md:flex-row lg:flex-col gap-5 order-2 lg:order-3">
					<Swap token={token} />

					<motion.div
						className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.1 }}
					>
						<HudCorner position="tl" />
						<HudCorner position="tr" />
						<HudCorner position="bl" />
						<HudCorner position="br" />
						<BondingCurveProgress token={token} />
					</motion.div>

					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
						<AgentPersonalityCard token={token} />
					</motion.div>

					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
						<AgentSkills token={token} />
					</motion.div>

					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
						<SidebarSocials token={token} />
					</motion.div>

					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.275 }}>
						<OwnerRuntimePanel token={token} />
					</motion.div>

					{isCreator && (
						<motion.div
							className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.3 }}
						>
							<HudCorner position="tl" />
							<HudCorner position="tr" />
							<HudCorner position="bl" />
							<HudCorner position="br" />
							<Button
								variant="outline"
								className="w-full text-xs font-mono lowercase"
								onClick={() => setSocialsModalOpen(true)}
							>
								update socials
							</Button>
							<UpdateSocialsModal
								open={socialsModalOpen}
								onClose={() => setSocialsModalOpen(false)}
								token={{
									chain: token.chain,
									chainId: String(token.chainId),
									contractAddress: token.contractAddress,
									socials: token.socials,
								}}
								onSuccess={() => {
									setSocialsModalOpen(false);
									query.refetch();
								}}
							/>
						</motion.div>
					)}
				</div>
			</div>

			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
