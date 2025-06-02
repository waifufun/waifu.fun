"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { AddressLike, IToken } from "@autofun/types";
import { Wallet } from "lucide-react";
import AdvancedSettings from "./advanced-settings";
import { cn, executeSwap } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Skeleton from "../skeleton-loading";
import useBalance from "@/hooks/use-balance";
import { useWallets } from "../hooks/providers/UseWalletContext";
import useTokenBalance from "@/hooks/use-token-balance";

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const [value, setValue] = useState<string>("");
	const wallets = useWallets();
	const address = wallets?.solanaWallets?.Mainnet?.address as AddressLike;
	const balance = useBalance({ chain: token.chain, address });
	const tokenBalance = useTokenBalance({
		chain: token.chain,
		contractAddress: token.contractAddress,
		address: address,
	});

	const quickSetButtons = ["Reset", "0.1", "0.5", "1.0"];

	const handleQuickSet = (val: string) => {
		const set = val === "Reset" ? "" : String(val);
		setValue(set);
	};

	const minReceivedQuery = useQuery({
		queryKey: [token.contractAddress, "mode", value],
		queryFn: async () => {
			await new Promise((resolve) => {
				setTimeout(() => {
					resolve(true);
				}, 1000);
			});

			return {
				minReceived: 230139,
			};
		},
		enabled: !!value,
		refetchInterval: 10_000,
	});

	const swapMutation = useMutation({
		mutationKey: [token.contractAddress, value],
		mutationFn: async () => {
			await new Promise((resolve) => {
				setTimeout(() => {
					resolve(true);
				}, 2000);
			});

			await executeSwap(token, value, mode);
		},
		onSuccess: () => {},
		onError: (e) => {
			toast.error(e.message);
		},
	});

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
						{mode === "buy" ? balance?.data : tokenBalance?.data} {mode === "buy" ? "SOL" : token.ticker}
					</span>
				</div>

				<div className="flex items-center gap-2 justify-between">
					{quickSetButtons.map((btn) => (
						<Button
							key={btn}
							variant="secondary"
							className={cn([
								"bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow h-[36px]",
								btn === "Reset" ? "text-autofun-text-secondary" : "",
							])}
							onClick={() => handleQuickSet(btn)}
						>
							{btn}
						</Button>
					))}
				</div>

				<div className="mt-2 space-y-2">
					<div className="flex font-medium justify-between text-base text-white">
						<p>Min Received</p>
						<div className="flex items-center gap-2">
							{minReceivedQuery?.isPending ? <Skeleton /> : <span>{minReceivedQuery?.data?.minReceived}</span>}

							{mode === "buy" ? token.ticker : "SOL"}
						</div>
					</div>

					{/* <div className="flex font-medium justify-between text-base text-white">
						<p>Price Impact</p>
						<p>25</p>
					</div> */}
					<AdvancedSettings />
					<Button
						disabled={swapMutation?.isPending}
						onClick={() => {
							swapMutation?.mutate();
						}}
						className="w-full mt-2 text-base font-medium bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] hover:border hover:border-[#03FF24] text-white uppercase"
					>
						{swapMutation?.isPending ? "Loading..." : "Swap"}
					</Button>
				</div>
			</div>
		</div>
	);
}
