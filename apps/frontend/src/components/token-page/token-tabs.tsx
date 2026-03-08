"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IToken } from "@waifufun/types";
import { ChartCandlestick, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@bprogress/next/app";

export default function TokenTabs({ token }: { token: IToken }) {
	const pathname = usePathname();
	const router = useRouter();
	const BASE_URL = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const splitted = pathname?.split("/") || [];
	const currentTab = !splitted || splitted.length < 6 ? "trades" : splitted[splitted.length - 1] || "trades";

	const tabs = [
		{ value: "trades", label: "trades", icon: ChartCandlestick, path: BASE_URL },
		{ value: "holders", label: "holders", icon: Users, path: `${BASE_URL}/holders` },
	];

	return (
		<Tabs value={currentTab}>
			<TabsList className="grid w-full grid-cols-2 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-0">
				{tabs.map((tab) => (
					<TabsTrigger
						key={tab.value}
						value={tab.value}
						filled={false}
						className="inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono lowercase tracking-wider text-[#52525b] hover:text-[#a1a1aa] hover:bg-[rgba(255,255,255,0.03)] rounded-sm transition-all duration-200 data-[state=active]:text-[#00ff87] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#00ff87] data-[state=active]:shadow-none"
						onClick={() => router.push(tab.path)}
					>
						<tab.icon className="size-4" />
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
