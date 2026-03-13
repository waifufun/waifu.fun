"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/contexts/locale-context";
import { useRouter } from "@bprogress/next/app";
import type { IToken } from "@waifufun/types";
import { ChartCandlestick, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { isHolderDataIndexed } from "./holder-data-state";

export default function TokenTabs({ token }: { token: IToken }) {
	const { t } = useTranslation();
	const pathname = usePathname();
	const router = useRouter();
	const holdersIndexed = isHolderDataIndexed(token);
	const BASE_URL = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const splitted = pathname?.split("/") || [];
	const currentTab = !splitted || splitted.length < 6 ? "trades" : splitted[splitted.length - 1] || "trades";

	const tabs = [
		{ value: "trades", label: t("token.tabs.trades"), icon: ChartCandlestick, path: BASE_URL },
		{ value: "holders", label: t("token.tabs.holders"), icon: Users, path: `${BASE_URL}/holders` },
	];

	return (
		<Tabs value={currentTab}>
			<TabsList className="grid w-full grid-cols-2 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-0">
				{tabs.map((tab) => {
					const isUnavailableHoldersTab = tab.value === "holders" && !holdersIndexed;

					return (
						<TabsTrigger
							key={tab.value}
							value={tab.value}
							filled={false}
							className="inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono lowercase tracking-wider text-[#71717a] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)] rounded-sm transition-all duration-200 data-[state=active]:text-[#00ff87] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#00ff87] data-[state=active]:shadow-none"
							onClick={() => router.push(tab.path)}
						>
							<tab.icon className="size-4" />
							{tab.label}
							{isUnavailableHoldersTab && (
								<span className="rounded-sm border border-[rgba(255,255,255,0.08)] px-1 py-0.5 text-[9px] leading-none text-[#71717a]">
									offline
								</span>
							)}
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
	);
}
