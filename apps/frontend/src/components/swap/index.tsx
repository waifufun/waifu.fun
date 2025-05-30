"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@autofun/types";

export default function Swap({ token }: { token: IToken }) {
	return (
		<div className="min-w-[460px] w-fit min-h-[355px] bg-[#262626] rounded-xl flex flex-col overflow-hidden">
			<Tabs defaultValue="buy" className="flex flex-col h-full">
				<TabsList className="w-full">
					<TabsTrigger value="buy">Buy</TabsTrigger>
					<TabsTrigger value="sell">Sell</TabsTrigger>
				</TabsList>

				<TabsContent value="buy" className="p-4 space-y-4">
					<SwapCard token={token} />
				</TabsContent>

				<TabsContent value="sell" className="p-4 text-white">
					<SwapCard token={token} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
