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
import MarketRibbon from "@/components/token-page/market-ribbon";
import MarketSnapshotCard from "@/components/token-page/market-snapshot-card";
import OwnerRuntimePanel from "@/components/token-page/owner-runtime-panel";
import RuntimeEconomicsCard from "@/components/token-page/runtime-economics-card";
import TokenTabs from "@/components/token-page/token-tabs";
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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import UpdateSocialsModal from "./UpdateSocialsModal";

function SectionLabel({ children }: { children: string }) {
	return (
		<div className="flex items-center gap-1.5 mb-2">
			<div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
			<span className="text-[10px] text-[#3f3f46] font-mono uppercase tracking-[0.16em] shrink-0">{children}</span>
			<div className="h-px flex-1 bg-gradient-to-l from-white/[0.06] to-transparent" />
		</div>
	);
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
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
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
	const searchParamViewMode: TokenDetailViewMode = searchParams.get("view") === "market" ? "market" : "agent";
	const [viewMode, setViewMode] = useState<TokenDetailViewMode>(searchParamViewMode);
	const [socialsModalOpen, setSocialsModalOpen] = useState(false);
	const isPriceUp = true;
	const chartSourceLabel = agentStatus.isExternalMarket
		? marketDataSource === "dexscreener"
			? "live external market"
			: "indexed fallback"
		: "waifu.fun market";

	useEffect(() => {
		setViewMode(searchParamViewMode);
	}, [searchParamViewMode]);

	const handleViewModeChange = (nextViewMode: TokenDetailViewMode) => {
		setViewMode(nextViewMode);

		const nextSearchParams = new URLSearchParams(searchParams.toString());
		if (nextViewMode === "market") {
			nextSearchParams.set("view", "market");
		} else {
			nextSearchParams.delete("view");
		}

		const nextQuery = nextSearchParams.toString();
		router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
	};

	return (
		<div className="mx-auto mt-4 flex w-full max-w-[1400px] min-w-0 flex-col gap-6 overflow-x-hidden px-4 pb-8 sm:px-6 md:px-8">
			<ScamWarning isHidden={!!token?.hidden} />

			{viewMode === "agent" ? (
				<>
					{/* Agent Home Layout */}
					<AgentProfile
						token={displayToken}
						status={agentStatus}
						marketDataSource={marketDataSource}
						headerAccessory={<ViewModeToggle value={viewMode} onChange={handleViewModeChange} />}
					/>

					{/* Market Ribbon - compact secondary metrics */}
					<MarketRibbon token={displayToken} marketDataSource={marketDataSource} />

					{/* Main content grid */}
					<div className="grid gap-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
						{/* Left: Agent context */}
						<div className="flex flex-col gap-5 min-w-0">
							{/* Status visual */}
							<AgentStatusVisual token={displayToken} status={agentStatus} marketDataSource={marketDataSource} />

							{/* Agent info / skills */}
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.12, duration: 0.3 }}
							>
								<AgentInfo token={displayToken} />
							</motion.div>

							{/* Runtime economics if present */}
							<RuntimeEconomicsCard token={displayToken} />

							{/* Activity tabs */}
							<div className="flex flex-col gap-3 pt-2">
								<SectionLabel>activity</SectionLabel>
								<TokenTabs token={displayToken} />
								{children}
							</div>
						</div>

						{/* Right: Controls sidebar */}
						<div className="flex flex-col gap-5">
							{/* Agent controls */}
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.16, duration: 0.3 }}
								className="flex flex-col gap-2"
							>
								<SectionLabel>controls</SectionLabel>
								<AgentPanel token={token} isCreator={isCreator} />
							</motion.div>

							{/* Bonding curve if applicable */}
							{agentStatus.state === "bonding" && typeof displayToken?.curveProgress === "number" && (
								<motion.div
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2, duration: 0.3 }}
									className="flex flex-col gap-2"
								>
									<SectionLabel>bonding curve</SectionLabel>
									<div className="rounded-sm border border-white/6 bg-[#111114]/60 p-4">
										<BondingCurveProgress token={displayToken} />
									</div>
								</motion.div>
							)}

							{/* Owner runtime panel */}
							{isCreator && (
								<motion.div
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.24, duration: 0.3 }}
									className="flex flex-col gap-2"
								>
									<SectionLabel>operator</SectionLabel>
									<OwnerRuntimePanel token={token} />

									{/* Settings */}
									<div className="rounded-sm border border-white/6 bg-[#111114]/60 p-4 mt-2">
										<Button
											variant="outline"
											className="w-full h-8 font-mono text-[10px] uppercase tracking-wider text-[#71717a] hover:text-[#a1a1aa]"
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
									</div>
								</motion.div>
							)}
						</div>
					</div>
				</>
			) : (
				<>
					{/* Market View Layout */}
					<AgentProfile
						token={displayToken}
						status={agentStatus}
						marketDataSource={marketDataSource}
						headerAccessory={<ViewModeToggle value={viewMode} onChange={handleViewModeChange} />}
					/>

					<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
						<div className="flex min-w-0 flex-col gap-5">
							{/* Chart */}
							<div className="flex min-w-0 flex-col gap-3">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<BarChart3 className={cn("size-4", isPriceUp ? "text-[#00ff87]" : "text-red-400")} />
										<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">price chart</span>
									</div>
									<span className="text-[10px] font-mono uppercase tracking-wider text-[#3f3f46]">
										{chartSourceLabel}
									</span>
								</div>

								<motion.div
									className={cn(
										"relative overflow-hidden rounded-sm border bg-[#111114]",
										isPriceUp ? "border-[#00ff87]/15" : "border-red-500/15",
									)}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
								>
									<div className="flex items-center justify-end gap-1 border-b border-white/[0.04] px-3 py-2">
										{TIMEFRAMES.map((timeframe) => (
											<button
												key={timeframe.value}
												type="button"
												onClick={() => setSelectedTimeframe(timeframe.value)}
												className={cn(
													"rounded-sm border px-2 py-1 font-mono text-[10px] uppercase transition-colors",
													selectedTimeframe === timeframe.value
														? "border-[#00ff87]/25 bg-[#00ff87]/[0.06] text-[#00ff87]"
														: "border-transparent text-[#52525b] hover:bg-white/[0.02] hover:text-[#a1a1aa]",
												)}
											>
												{timeframe.label}
											</button>
										))}
									</div>

									<div className="p-2 sm:p-3">
										<Chart token={liveMarketToken} timeframe={selectedTimeframe} />
									</div>
								</motion.div>
							</div>

							{/* Market Snapshot */}
							<MarketSnapshotCard token={displayToken} marketDataSource={marketDataSource} />

							{/* Tabs and activity */}
							<TokenTabs token={displayToken} />
							{children}
						</div>

						{/* Trading sidebar */}
						<div className="flex min-w-0 flex-col gap-5">
							<div className="flex flex-col gap-2">
								<SectionLabel>trading</SectionLabel>
								<Swap token={token} />

								{agentStatus.state === "bonding" && typeof displayToken?.curveProgress === "number" && (
									<div className="rounded-sm border border-white/6 bg-[#111114]/60 p-4 mt-2">
										<BondingCurveProgress token={displayToken} />
									</div>
								)}
							</div>

							<div className="flex flex-col gap-2">
								<SectionLabel>agent</SectionLabel>
								<AgentStatusVisual token={displayToken} status={agentStatus} marketDataSource={marketDataSource} />
								<AgentInfo token={displayToken} />
							</div>

							<div className="flex flex-col gap-2">
								<SectionLabel>controls</SectionLabel>
								<AgentPanel token={token} isCreator={isCreator} />
							</div>

							{isCreator && (
								<div className="flex flex-col gap-2">
									<SectionLabel>operator</SectionLabel>
									<OwnerRuntimePanel token={token} />
									<div className="rounded-sm border border-white/6 bg-[#111114]/60 p-4 mt-2">
										<Button
											variant="outline"
											className="w-full h-8 font-mono text-[10px] uppercase tracking-wider text-[#71717a] hover:text-[#a1a1aa]"
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
									</div>
								</div>
							)}
						</div>
					</div>
				</>
			)}

			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
