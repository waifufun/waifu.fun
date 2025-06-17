"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SwapCard from "./swap-card";
import type { IToken } from "@autofun/types";
import { useState } from "react";

export default function Swap({ token }: { token: IToken }) {
	const [mode, setMode] = useState<"buy" | "sell">("buy");
	return (
		<div className="flex flex-col overflow-hidden bg-black border-2 border-[#03FF24]/40 p-3 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.3)]">
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
