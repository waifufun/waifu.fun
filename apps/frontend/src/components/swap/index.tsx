"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@autofun/types";
import { useState } from "react";

export default function Swap({ token }: { token: IToken }) {
	const [mode, setMode] = useState<"buy" | "sell">("buy");
	return (
		<div className="flex flex-col overflow-hidden">
			<Tabs defaultValue={mode} value={mode} className="flex flex-col h-full">
				<TabsList className="w-full h-[51px]">
					<TabsTrigger value="buy" onClick={() => setMode("buy")}>
						Buy
					</TabsTrigger>
					<TabsTrigger value="sell" onClick={() => setMode("sell")}>
						Sell
					</TabsTrigger>
				</TabsList>

				<div className="p-4 bg-[#0C0C0C] rounded-b-sm">
					<SwapCard token={token} mode={mode} />
				</div>
			</Tabs>
		</div>
	);
}
