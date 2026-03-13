"use client";

import BondingCurveProgress from "@/components/bonding-curve-progress";
import Chart from "@/components/chart/chart";
import ClaimFees from "@/components/claim-fees";
import ScamWarning from "@/components/scam-notice";
import Swap from "@/components/swap";
import AgentPanel from "@/components/token-page/agent-panel";
import AgentProfile, { deriveAgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { AgentInfo } from "@/components/token-page/agent-skills";
import AgentStatusVisual from "@/components/token-page/agent-status-visual";
import { isHolderDataIndexed } from "@/components/token-page/holder-data-state";
import OwnerRuntimePanel from "@/components/token-page/owner-runtime-panel";
import TokenTabs from "@/components/token-page/token-tabs";
import { useLiveMarketToken } from "@/components/token-page/use-live-market-token";
import { Button } from "@/components/ui/button";
import useAddress from "@/hooks/use-address";
import { type ChartTimeframe, getToken } from "@/lib/api";
import { cn, isSameWalletAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import { motion } from "framer-motion";
import { BarChart3, ChevronDown } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import UpdateSocialsModal from "./UpdateSocialsModal";

function HudCorner({ position, color = "green" }: { position: "tl" | "tr" | "bl" | "br"; color?: "green" | "purple" }) {
	const base = "absolute w-2.5 h-2.5 pointer-events-none";
	const borderColor = color === "green" ? "border-[#00ff87]/20" : "border-[#c084fc]/20";
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l ${borderColor}`,
		tr: `${base} top-0 right-0 border-t border-r ${borderColor}`,
		bl: `${base} bottom-0 left-0 border-b border-l ${borderColor}`,
		br: `${base} bottom-0 right-0 border-b border-r ${borderColor}`,
	};
	return <span className={styles[position]} />;
}

function SectionHeader({ children }: { children: string }) {
	return <div className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider mb-3">{children}</div>;
}

function SectionDivider() {
	return <div className="h-px bg-[rgba(255,255,255,0.06)] my-5" />;
}

const TIMEFRAMES: Array<{ label: string; value: ChartTimeframe }> = [
	{ label: "1h", value: "1h" },
	{ label: "4h", value: "4h" },
	{ label: "1d", value: "1d" },
	{ label: "1w", value: "1w" },
	{ label: "all", value: "all" },
];

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
	const { token: liveMarketToken, marketDataSource } = useLiveMarketToken(token);
	const displayToken = useMemo(
		() => (isHolderDataIndexed(token) ? liveMarketToken : { ...liveMarketToken, holders: 0 }),
		[liveMarketToken, token],
	);
	const agentStatus = useMemo(() => deriveAgentLifecycleStatus(displayToken), [displayToken]);
	const isCreator = useMemo(() => {
		if (currentAddress && token?.creator) {
			return isSameWalletAddress(currentAddress, token.creator);
		}
		return false;
	}, [currentAddress, token?.creator]);
	const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>("1d");
	const [socialsModalOpen, setSocialsModalOpen] = useState(false);
	const [marketDataExpanded, setMarketDataExpanded] = useState(true);
	const panelSectionRef = useRef<HTMLDivElement | null>(null);
	const isPriceUp = true;

	return (
		<div className="flex flex-col gap-4 sm:gap-5 mt-3 w-full min-w-0 max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 overflow-x-hidden">
			<ScamWarning isHidden={!!token?.hidden} />
			<AgentProfile token={displayToken} status={agentStatus} marketDataSource={marketDataSource} />

			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4 sm:gap-5 min-w-0">
				{/* LEFT COLUMN - Agent Dashboard */}
				<div className="w-full min-w-0 lg:min-w-0 lg:w-[60%] lg:max-w-[60%] flex flex-col gap-4 sm:gap-5 order-2">
					{/* Agent Controls */}
					<div className="flex flex-col gap-4">
						<SectionHeader>agent controls</SectionHeader>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.05 }}
							className="min-w-0"
						>
							<AgentPanel token={token} isCreator={isCreator} />
						</motion.div>
					</div>

					<SectionDivider />

					{/* Agent Personality & Skills */}
					<div className="flex flex-col gap-4">
						<SectionHeader>agent info</SectionHeader>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.1 }}
							className="min-w-0"
						>
							<AgentInfo token={displayToken} />
						</motion.div>
					</div>

					{/* Owner Runtime Panel */}
					{isCreator && (
						<>
							<SectionDivider />
							<div className="flex flex-col gap-4">
								<SectionHeader>runtime controls</SectionHeader>
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2 }}
									className="min-w-0"
								>
									<OwnerRuntimePanel token={token} />
								</motion.div>
							</div>
						</>
					)}

					<SectionDivider />

					{/* Market Data - Collapsible Chart Section */}
					<div className="flex flex-col gap-4">
						<button
							type="button"
							onClick={() => setMarketDataExpanded(!marketDataExpanded)}
							className="flex items-center justify-between group cursor-pointer"
						>
							<SectionHeader>market data</SectionHeader>
							<motion.div
								initial={false}
								animate={{ rotate: marketDataExpanded ? 180 : 0 }}
								transition={{ duration: 0.2 }}
								className="text-[#71717a] group-hover:text-[#a1a1aa] transition-colors"
							>
								<ChevronDown className="size-4" />
							</motion.div>
						</button>

						<motion.div
							initial={false}
							animate={{
								height: marketDataExpanded ? "auto" : 0,
								opacity: marketDataExpanded ? 1 : 0,
								marginBottom: marketDataExpanded ? 0 : -16,
							}}
							transition={{ duration: 0.3, ease: "easeInOut" }}
							className="overflow-hidden"
						>
							<motion.div
								ref={panelSectionRef}
								className={cn(
									"relative bg-[#111114] border rounded-sm overflow-hidden transition-all duration-500 min-w-0",
									isPriceUp
										? "border-[#00ff87]/20 shadow-[0_0_20px_rgba(0,255,135,0.05)]"
										: "border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]",
								)}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.25, duration: 0.3 }}
							>
								<HudCorner position="tl" color={isPriceUp ? "green" : "purple"} />
								<HudCorner position="tr" color={isPriceUp ? "green" : "purple"} />
								<HudCorner position="bl" color={isPriceUp ? "green" : "purple"} />
								<HudCorner position="br" color={isPriceUp ? "green" : "purple"} />

								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
									<div className="flex items-center gap-2 min-w-0">
										<BarChart3 className={cn("size-4 flex-shrink-0", isPriceUp ? "text-[#00ff87]" : "text-red-400")} />
										<span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider truncate">
											price chart
										</span>
									</div>

									<div className="flex items-center gap-1 flex-wrap">
										{TIMEFRAMES.map((timeframe) => (
											<button
												key={timeframe.value}
												type="button"
												onClick={() => setSelectedTimeframe(timeframe.value)}
												className={cn(
													"px-2 py-1 text-[10px] font-mono uppercase rounded-sm transition-all duration-200",
													selectedTimeframe === timeframe.value
														? "bg-[#00ff87]/10 text-[#00ff87] border border-[#00ff87]/30"
														: "text-[#71717a] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)] border border-transparent",
												)}
											>
												{timeframe.label}
											</button>
										))}
									</div>
								</div>

								<div className="p-2 sm:p-3 min-h-0 overflow-hidden">
									<Chart token={token} timeframe={selectedTimeframe} />
								</div>
								<div
									className={cn(
										"absolute bottom-0 left-0 right-0 h-1 blur-sm",
										isPriceUp ? "bg-[#00ff87]/20" : "bg-red-500/20",
									)}
								/>
							</motion.div>
						</motion.div>
					</div>

					{/* Token Tabs */}
					<div className="flex flex-col gap-4">
						<TokenTabs token={displayToken} />
						{children}
					</div>
				</div>

				{/* RIGHT COLUMN - Trading & Status */}
				<div className="w-full min-w-0 lg:w-[40%] lg:min-w-0 flex flex-col md:flex-row md:flex-wrap lg:flex-nowrap lg:flex-col gap-4 sm:gap-5 order-3">
					{/* Trading Section */}
					<div className="flex flex-col gap-4 w-full">
						<SectionHeader>trading</SectionHeader>
						<Swap token={token} />

						{typeof token?.curveProgress === "number" && !token?.curveCompleted && !token?.imported && (
							<motion.div
								className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors min-w-0"
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
						)}
					</div>

					<SectionDivider />

					{/* Agent Status */}
					<div className="flex flex-col gap-4 w-full">
						<SectionHeader>agent status</SectionHeader>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.15 }}
							className="min-w-0"
						>
							<AgentStatusVisual status={agentStatus} />
						</motion.div>
					</div>

					{/* Update Socials */}
					{isCreator && (
						<>
							<SectionDivider />
							<div className="flex flex-col gap-4 w-full">
								<SectionHeader>settings</SectionHeader>
								<motion.div
									className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors"
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2 }}
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
							</div>
						</>
					)}
				</div>
			</div>

			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
