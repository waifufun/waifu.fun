"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@waifufun/types";
import { useState } from "react";

export default function Swap({ token }: { token: IToken }) {
	const [mode, setMode] = useState<"buy" | "sell">("buy");
	return (
		<div className="flex flex-col overflow-hidden bg-[#111114] border border-[rgba(255,255,255,0.06)] p-4 rounded-sm">
			<Tabs defaultValue={mode} value={mode} className="flex flex-col h-full">
				<TabsList className="grid grid-cols-2 gap-0 w-full h-[44px] bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-0.5">
					<TabsTrigger
						value="buy"
						onClick={() => setMode("buy")}
						className="data-[state=active]:bg-white/10 data-[state=active]:text-[#e4e4e7] data-[state=active]:shadow-none rounded-sm"
					>
						Buy
					</TabsTrigger>
					<TabsTrigger
						value="sell"
						onClick={() => setMode("sell")}
						className="data-[state=active]:bg-white/10 data-[state=active]:text-[#e4e4e7] data-[state=active]:shadow-none rounded-sm"
					>
						Sell
					</TabsTrigger>
				</TabsList>

				<div className="mt-4">
					<SwapCard token={token} mode={mode} />
				</div>
			</Tabs>
		</div>
	);
}
