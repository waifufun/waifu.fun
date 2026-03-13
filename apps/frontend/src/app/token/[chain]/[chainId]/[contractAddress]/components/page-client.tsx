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
import MarketSnapshotCard from "@/components/token-page/market-snapshot-card";
import OwnerRuntimePanel from "@/components/token-page/owner-runtime-panel";
import TokenTabs from "@/components/token-page/token-tabs";
import TreasuryReadOnlyCard from "@/components/token-page/treasury-read-only-card";
import { useLiveMarketToken } from "@/components/token-page/use-live-market-token";
import ViewModeToggle, { type TokenDetailViewMode } from "@/components/token-page/view-mode-toggle";
import { Button } from "@/components/ui/button";
import useAddress from "@/hooks/use-address";
import { type ChartTimeframe, getToken } from "@/lib/api";
import { cn, isSameWalletAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
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
	return <div className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">{children}</div>;
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
	const displayToken = useMemo<IToken>(() => liveMarketToken, [liveMarketToken]);
	const agentStatus = useMemo(() => deriveAgentLifecycleStatus(displayToken), [displayToken]);
	const isCreator = useMemo(() => {
		if (currentAddress && token?.creator) {
			return isSameWalletAddress(currentAddress, token.creator);
		}
		return false;
	}, [currentAddress, token?.creator]);
	const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>("1d");
	const [viewMode, setViewMode] = useState<TokenDetailViewMode>("agent");
	const [socialsModalOpen, setSocialsModalOpen] = useState(false);
	const isPriceUp = true;
	const chartSourceLabel = agentStatus.isExternalMarket
		? marketDataSource === "dexscreener"
			? "live external market"
			: "indexed fallback"
		: "waifu.fun market";

	return (
		<div className="mx-auto mt-3 flex w-full max-w-[1600px] min-w-0 flex-col gap-5 overflow-x-hidden px-3 pb-6 sm:gap-6 sm:px-4 md:px-6">
			<ScamWarning isHidden={!!token?.hidden} />
			<AgentProfile
				token={displayToken}
				status={agentStatus}
				marketDataSource={marketDataSource}
				headerAccessory={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
			/>

			{viewMode === "agent" ? (
				<>
					<div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.72fr)]">
						<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
							<div className="flex min-w-0 flex-col gap-3">
								<div className="flex min-w-0 items-center justify-between gap-3">
									<SectionHeader>agent overview</SectionHeader>
									<span className="text-right font-mono text-[10px] uppercase tracking-wider text-[#52525b]">
										{agentStatus.label}
									</span>
								</div>

								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.08 }}
									className="min-w-0"
								>
									<AgentStatusVisual token={displayToken} status={agentStatus} marketDataSource={marketDataSource} />
								</motion.div>

								<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.12 }}
										className="min-w-0"
									>
										<AgentInfo token={displayToken} />
									</motion.div>

									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.16 }}
										className="min-w-0"
									>
										<MarketSnapshotCard token={displayToken} marketDataSource={marketDataSource} />
									</motion.div>
								</div>
							</div>

							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.2 }}
								className="min-w-0"
							>
								<TreasuryReadOnlyCard token={displayToken} />
							</motion.div>
						</div>

						<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
							<div className="flex min-w-0 flex-col gap-3">
								<SectionHeader>agent controls</SectionHeader>
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.24 }}
									className="min-w-0"
								>
									<AgentPanel token={token} isCreator={isCreator} />
								</motion.div>
							</div>

							{agentStatus.state === "bonding" && typeof displayToken?.curveProgress === "number" && (
								<div className="flex min-w-0 flex-col gap-3">
									<SectionHeader>bonding curve</SectionHeader>
									<motion.div
										className="relative min-w-0 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]"
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.28 }}
									>
										<HudCorner position="tl" />
										<HudCorner position="tr" />
										<HudCorner position="bl" />
										<HudCorner position="br" />
										<BondingCurveProgress token={displayToken} />
									</motion.div>
								</div>
							)}

							{isCreator && (
								<div className="flex min-w-0 flex-col gap-3">
									<SectionHeader>runtime controls</SectionHeader>
									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.32 }}
										className="min-w-0"
									>
										<OwnerRuntimePanel token={token} />
									</motion.div>
								</div>
							)}
						</div>
					</div>
				</>
			) : (
				<div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
					<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
						<div className="flex min-w-0 flex-col gap-3">
							<div className="flex min-w-0 items-center justify-between gap-3">
								<SectionHeader>market data</SectionHeader>
								<span className="text-right font-mono text-[10px] uppercase tracking-wider text-[#52525b]">
									{chartSourceLabel}
								</span>
							</div>

							<motion.div
								className={cn(
									"relative min-w-0 overflow-hidden rounded-sm border bg-[#111114] transition-all duration-500",
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

								<div className="flex flex-col gap-3 border-b border-[rgba(255,255,255,0.06)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
									<div className="flex min-w-0 items-center gap-2">
										<BarChart3 className={cn("size-4 shrink-0", isPriceUp ? "text-[#00ff87]" : "text-red-400")} />
										<div className="min-w-0">
											<p className="truncate font-mono text-[10px] uppercase tracking-wider text-[#71717a]">
												price chart
											</p>
											<p className="mt-0.5 truncate text-[11px] leading-tight text-[#52525b]">
												Dedicated market view for price, flow, and activity.
											</p>
										</div>
									</div>

									<div className="flex flex-wrap items-center gap-1">
										{TIMEFRAMES.map((timeframe) => (
											<button
												key={timeframe.value}
												type="button"
												onClick={() => setSelectedTimeframe(timeframe.value)}
												className={cn(
													"rounded-sm border px-2 py-1 font-mono text-[10px] uppercase transition-all duration-200",
													selectedTimeframe === timeframe.value
														? "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]"
														: "border-transparent text-[#71717a] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#a1a1aa]",
												)}
											>
												{timeframe.label}
											</button>
										))}
									</div>
								</div>

								<div className="min-h-0 overflow-hidden p-2 sm:p-3">
									<Chart token={liveMarketToken} timeframe={selectedTimeframe} />
								</div>

								<div
									className={cn(
										"absolute bottom-0 left-0 right-0 h-1 blur-sm",
										isPriceUp ? "bg-[#00ff87]/20" : "bg-red-500/20",
									)}
								/>
							</motion.div>
						</div>

						<div className="flex min-w-0 flex-col gap-3">
							<TokenTabs token={displayToken} />
							{children}
						</div>
					</div>

					<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
						<div className="flex w-full min-w-0 flex-col gap-3">
							<SectionHeader>trading</SectionHeader>
							<Swap token={token} />

							{agentStatus.state === "bonding" && typeof displayToken?.curveProgress === "number" && (
								<motion.div
									className="relative min-w-0 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]"
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.08 }}
								>
									<HudCorner position="tl" />
									<HudCorner position="tr" />
									<HudCorner position="bl" />
									<HudCorner position="br" />
									<BondingCurveProgress token={displayToken} />
								</motion.div>
							)}
						</div>

						<div className="flex min-w-0 flex-col gap-3">
							<div className="flex min-w-0 items-center justify-between gap-3">
								<SectionHeader>agent overview</SectionHeader>
								<span className="text-right font-mono text-[10px] uppercase tracking-wider text-[#52525b]">
									{agentStatus.label}
								</span>
							</div>

							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.12 }}
								className="min-w-0"
							>
								<AgentStatusVisual token={displayToken} status={agentStatus} marketDataSource={marketDataSource} />
							</motion.div>

							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.16 }}
								className="min-w-0"
							>
								<AgentInfo token={displayToken} />
							</motion.div>
						</div>
					</div>
				</div>
			)}

			<div
				className={cn(
					"grid items-start gap-4 sm:gap-5",
					isCreator && viewMode === "market" && "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]",
				)}
			>
				{viewMode === "market" && (
					<>
						<div className="flex min-w-0 flex-col gap-3">
							<SectionHeader>agent controls</SectionHeader>
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.2 }}
								className="min-w-0"
							>
								<AgentPanel token={token} isCreator={isCreator} />
							</motion.div>
						</div>

						{isCreator && (
							<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
								<div className="flex min-w-0 flex-col gap-3">
									<SectionHeader>runtime controls</SectionHeader>
									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.24 }}
										className="min-w-0"
									>
										<OwnerRuntimePanel token={token} />
									</motion.div>
								</div>

								<div className="flex min-w-0 flex-col gap-3">
									<SectionHeader>settings</SectionHeader>
									<motion.div
										className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]"
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.28 }}
									>
										<HudCorner position="tl" />
										<HudCorner position="tr" />
										<HudCorner position="bl" />
										<HudCorner position="br" />
										<Button
											variant="outline"
											className="w-full font-mono text-xs lowercase"
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
							</div>
						)}
					</>
				)}
			</div>

			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
