"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { useRouter } from "@bprogress/next/app";
import type { IToken } from "@waifufun/types";
import { Activity, ChartCandlestick, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { hasAggregateHolderCount, isHolderDataIndexed } from "./holder-data-state";

export default function TokenTabs({ token, compact = false }: { token: IToken; compact?: boolean }) {
	const { t } = useTranslation();
	const pathname = usePathname();
	const router = useRouter();
	const holdersIndexed = isHolderDataIndexed(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);
	const holdersTabAvailable = holdersIndexed || hasAggregateHolders;
	const BASE_URL = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const splitted = pathname?.split("/") || [];
	const currentTab = !splitted || splitted.length < 6 ? "trades" : splitted[splitted.length - 1] || "trades";

	const tabs = [
		{
			value: "trades",
			label: t("token.tabs.trades"),
			icon: ChartCandlestick,
			path: BASE_URL,
			disabled: false,
		},
		{
			value: "holders",
			label: t("token.tabs.holders"),
			icon: Users,
			path: `${BASE_URL}/holders`,
			disabled: !holdersTabAvailable,
			hint: !holdersIndexed ? (hasAggregateHolders ? "aggregate only" : "offline") : undefined,
		},
	];

	return (
		<div className="flex flex-col gap-2">
			{!compact && (
				<div className="flex items-center justify-between gap-3 px-0.5">
					<div className="flex items-center gap-1.5">
						<Activity className="size-3 text-[#52525b]" />
						<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">activity</span>
					</div>
					{!holdersIndexed && (
						<span className="text-right text-[10px] text-[#3f3f46] font-mono uppercase tracking-wider">
							{hasAggregateHolders ? "aggregate holders only" : "wallet leaderboard offline"}
						</span>
					)}
				</div>
			)}
			<Tabs value={currentTab}>
				<TabsList
					className={cn(
						"grid w-full bg-[#0a0a0d] border border-white/[0.04] rounded-sm p-0.5 gap-0.5 h-auto",
						tabs.length === 2 && "grid-cols-2",
						tabs.length === 3 && "grid-cols-3",
					)}
				>
					{tabs.map((tab) => {
						return (
							<TabsTrigger
								key={tab.value}
								value={tab.value}
								filled={false}
								disabled={tab.disabled}
								className={cn(
									"inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-mono lowercase tracking-wider",
									"text-[#52525b] rounded-sm border border-transparent transition-all duration-200",
									"hover:text-[#a1a1aa] hover:bg-white/[0.02]",
									"data-[state=active]:text-[#00ff87] data-[state=active]:bg-[#00ff87]/[0.06] data-[state=active]:border-[#00ff87]/15",
									"disabled:opacity-40 disabled:cursor-not-allowed",
									compact ? "min-h-[36px]" : "min-h-[40px]",
								)}
								onClick={() => !tab.disabled && router.push(tab.path)}
							>
								<tab.icon className="size-3.5 shrink-0" />
								<span className="truncate">{tab.label}</span>
								{tab.hint && (
									<span className="rounded-sm border border-white/6 px-1 py-0.5 text-[9px] leading-none text-[#52525b]">
										{tab.hint}
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
