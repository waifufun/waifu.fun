"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@waifufun/types";
import { useState } from "react";

export default function Swap({ token }: { token: IToken }) {
	const [mode, setMode] = useState<"buy" | "sell">("buy");
	return (
		<div className="flex flex-col overflow-hidden min-w-0 bg-[#111114] border border-[rgba(255,255,255,0.06)] p-3 rounded-sm">
			<Tabs defaultValue={mode} value={mode} className="flex flex-col h-full">
				<TabsList className="grid grid-cols-2 gap-0 w-full h-[51px]">
					<TabsTrigger value="buy" onClick={() => setMode("buy")}>
						Buy
					</TabsTrigger>
					<TabsTrigger value="sell" onClick={() => setMode("sell")}>
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
