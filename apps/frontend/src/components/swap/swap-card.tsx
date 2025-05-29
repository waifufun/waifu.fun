"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { IToken } from "@autofun/types";
import { useWallets } from "../hooks/providers/UseWalletContext";
import { Wallet } from "lucide-react";
import SwapStats from "./swap-stats";
import AdvancedSettings from "./advanced-settings";

export default function SwapCard({ token }: { token: IToken }) {
	const [value, setValue] = useState("");
	const [balance, setBalance] = useState<number>(0);

    
	const quickSetButtons = ["Reset", "0.1", "0.5", "1.0"];
    const initialSettings = { speed: "Normal", slippage: "0.5", deadline: "5", };
    const [settings, setSettings] = useState(initialSettings);


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
		<div className="w-full h-full rounded-xl overflow-hidden">
			<div className="flex flex-col gap-2">
				<div className="flex items-stretch gap-2 w-full">
					<SwapInput align="left" value={value} onUserInput={setValue} mode="buy" className="flex-grow" />

					<div className="flex flex-row gap-x-1 mr-2 justify-end items-center w-full">
						<Image
							src={
								token?.image || (token?.chain === "solana" ? "/chain-icons/solana.svg" : "/chain-icons/ethereum.svg")
							}
							alt={token?.ticker || "token"}
							width={24}
							height={24}
							className="mb-1"
						/>
						ETH
					</div>
				</div>
				<div className="flex flex-row gap-x-1 justify-end items-center w-full mr-5 gap-1 text-[#8C8C8C] text-sm font-medium">
					<Wallet size={14} color="#8C8C8C" />
					<span>{balance} SOL</span>
				</div>

				<QuickSetButtons buttons={quickSetButtons} onClick={handleQuickSet} />
				<div className="mt-2 space-y-2">
					<SwapStats minReceived="25" priceImpact="0.3%" />
                    <AdvancedSettings settings={settings} onChange={setSettings} />
					<Button className="w-full mt-2 text-base font-medium bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] hover:border hover:border-[#03FF24] text-white uppercase">
						Swap
					</Button>
				</div>
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
