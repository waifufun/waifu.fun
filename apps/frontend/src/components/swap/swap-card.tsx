"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { ISwapSettings, IToken } from "@autofun/types";
import { useWallets } from "../hooks/providers/UseWalletContext";
import { Wallet } from "lucide-react";
import AdvancedSettings from "./advanced-settings";

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const [value, setValue] = useState("");
	const [balance, setBalance] = useState<number>(0);
	const { solanaWallets } = useWallets();

	const quickSetButtons = ["Reset", "0.1", "0.5", "1.0"];
	const initialSettings: ISwapSettings = {
		speed: "normal",
		slippage: "0.5",
		deadline: "5",
	};
	const [settings, setSettings] = useState(initialSettings);

	const handleQuickSet = (val: string) => {
		setValue(val === "Reset" ? "" : val);
	};

	useEffect(() => {
		const getBalance = async () => {
			const balance = await solanaWallets?.Mainnet?.getNativeBalance();
			console.log({ balance })
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
					<SwapInput align="left" value={value} onUserInput={setValue} className="w-full" />
					<div className="flex flex-row gap-x-1 mr-2 justify-end items-center w-1/4">
						<Image
							unoptimized
							priority
							className="rounded-md"
							src={
								mode === "buy"
									? token?.chain === "solana"
										? "/chain-icons/solana.svg"
										: "/chain-icons/ethereum.svg"
									: token.image
							}
							alt={token?.ticker || "token"}
							width={24}
							height={24}
						/>
						<span className="uppercase">{mode === "buy" ? "SOL" : token.ticker}</span>
					</div>
				</div>
				<div className="flex flex-row gap-x-1 justify-end items-center w-full mr-5 gap-1 text-[#8C8C8C] text-sm font-medium">
					<Wallet size={14} color="#8C8C8C" />
					<span className="uppercase">
						{balance} {mode === "buy" ? "SOL" : token.ticker}
					</span>
				</div>

				<div className="flex items-center gap-2 justify-between">
					{quickSetButtons.map((btn) => (
						<Button
							key={btn}
							variant="secondary"
							className="bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow"
							onClick={() => handleQuickSet(btn)}
						>
							{btn}
						</Button>
					))}
				</div>

				<div className="mt-2 space-y-2">
					<div className="flex font-medium justify-between text-base text-white">
						<p>Min Received</p>
						<p>25 {mode === "buy" ? token.ticker : "SOL"}</p>
					</div>

					<div className="flex font-medium justify-between text-base text-white">
						<p>Price Impact</p>
						<p>25</p>
					</div>
					<AdvancedSettings settings={settings} onChange={setSettings} />
					<Button className="w-full mt-2 text-base font-medium bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] hover:border hover:border-[#03FF24] text-white uppercase">
						Swap
					</Button>
				</div>
			</div>
		</div>
	);
}
