"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/contexts/locale-context";
import { useRouter } from "@bprogress/next/app";
import type { IToken } from "@waifufun/types";
import { ChartCandlestick, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { hasAggregateHolderCount, isHolderDataIndexed } from "./holder-data-state";

export default function TokenTabs({ token }: { token: IToken }) {
	const { t } = useTranslation();
	const pathname = usePathname();
	const router = useRouter();
	const holdersIndexed = isHolderDataIndexed(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);
	const BASE_URL = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const splitted = pathname?.split("/") || [];
	const currentTab = !splitted || splitted.length < 6 ? "trades" : splitted[splitted.length - 1] || "trades";

	const tabs = [
		{ value: "trades", label: t("token.tabs.trades"), icon: ChartCandlestick, path: BASE_URL },
		{ value: "holders", label: t("token.tabs.holders"), icon: Users, path: `${BASE_URL}/holders` },
	];

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3 px-1">
				<div className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">token activity</div>
				{!holdersIndexed && (
					<div className="text-right text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
						{hasAggregateHolders ? "aggregate holders only" : "wallet leaderboard offline"}
					</div>
				)}
			</div>
			<Tabs value={currentTab}>
				<TabsList className="grid w-full grid-cols-2 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-1 gap-1 h-auto">
					{tabs.map((tab) => {
						const isUnavailableHoldersTab = tab.value === "holders" && !holdersIndexed;

						return (
							<TabsTrigger
								key={tab.value}
								value={tab.value}
								filled={false}
								className="inline-flex min-h-[42px] items-center justify-center gap-2 px-3 py-2.5 text-xs font-mono lowercase tracking-wider text-[#71717a] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)] rounded-sm border border-transparent transition-all duration-200 data-[state=active]:text-[#00ff87] data-[state=active]:bg-[#00ff87]/8 data-[state=active]:border-[#00ff87]/20 data-[state=active]:shadow-none"
								onClick={() => router.push(tab.path)}
							>
								<tab.icon className="size-4 shrink-0" />
								<span className="truncate">{tab.label}</span>
								{isUnavailableHoldersTab && (
									<span className="rounded-sm border border-[rgba(255,255,255,0.08)] px-1 py-0.5 text-[9px] leading-none text-[#71717a]">
										unavailable
									</span>
								)}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>
		</div>
	);
}
