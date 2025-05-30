"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@autofun/types";
import { useState } from "react";

export default function Swap({ token }: { token: IToken }) {
	const [mode, setMode] = useState<"buy" | "sell">("buy");
	return (
		<div className="bg-[#262626] rounded-xl flex flex-col overflow-hidden">
			<Tabs defaultValue={mode} value={mode} className="flex flex-col h-full">
				<TabsList className="w-full">
					<TabsTrigger value="buy" onClick={() => setMode("buy")}>
						Buy
					</TabsTrigger>
					<TabsTrigger value="sell" onClick={() => setMode("sell")}>
						Sell
					</TabsTrigger>
				</TabsList>

				<div className="p-4">
					<SwapCard token={token} mode={mode} />
				</div>
			</Tabs>
		</div>
	);
}
