"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; // adjust path if needed
import Image from "next/image";
import type { IToken } from "@autofun/types";
import { useWallets } from "../hooks/providers/UseWalletContext";
import { Wallet } from "lucide-react";
import SwapStats from "./swap-stats";

export default function SwapCard({ token }: { token: IToken }) {
	const [value, setValue] = useState("");
	const [balance, setBalance] = useState<number>(0);
	const quickSetButtons = ["Reset", "0.1", "0.5", "1.0"];

	const handleQuickSet = (val: string) => {
		setValue(val === "Reset" ? "" : val);
	};
	const { solanaWallets } = useWallets();

	useEffect(() => {
		const getBalance = async () => {
			const balance = await solanaWallets?.Devnet?.getNativeBalance();
			if (balance !== undefined) {
				setBalance(balance);
			}
		};

		if (solanaWallets?.Devnet) {
			getBalance();
		}
	}, [solanaWallets]);

	return (
		<div className="w-[460px] h-[355px]  rounded-xl overflow-hidden">
			<div className="p-4 flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<SwapInput align="left" value={value} onUserInput={setValue} mode="buy" />

					<div className="flex flex-col items-start gap-[2px]">
						<div className="flex items-center gap-1">
							<Image
								src={
									token?.image || (token?.chain === "solana" ? "/chain-icons/solana.svg" : "/chain-icons/ethereum.svg")
								}
								alt={token?.ticker || "token"}
								width={24}
								height={24}
							/>
							<span className="text-white text-base font-normal">{token?.ticker}</span>
						</div>

						<div className="flex flex-row items-center gap-1 leading-none">
							<Wallet size={14} color="#8C8C8C" />
							<p className="text-[#8C8C8C] text-sm font-medium">{balance} SOL</p>
						</div>
					</div>
				</div>

				<QuickSetButtons buttons={quickSetButtons} onClick={handleQuickSet} />
				<SwapStats minReceived="25" priceImpact="0.3%" advancedSettings={true} />
				<Button className="w-full mt-2 text-base font-medium">Swap</Button>
			</div>
		</div>
	);
}

function QuickSetButtons({ buttons, onClick }: { buttons: string[]; onClick: (val: string) => void }) {
	return (
		<div className="flex gap-2">
			{buttons.map((btn) => (
				<Button
					key={btn}
					variant="secondary"
					className="bg-gradient-to-t from-[#121212] to-[#171717] w-[102px] h-[36px] text-sm"
					onClick={() => onClick(btn)}
				>
					{btn}
				</Button>
			))}
		</div>
	);
}
