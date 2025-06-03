"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { AddressLike, IToken } from "@autofun/types";
import { Wallet } from "lucide-react";
import AdvancedSettings from "./advanced-settings";
import { abbreviateNumber, cn, executeSwap, retrieveQuote } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Skeleton from "../skeleton-loading";
import useBalance from "@/hooks/use-balance";
import { useWallets } from "../hooks/providers/UseWalletContext";
import useTokenBalance from "@/hooks/use-token-balance";
import useSpeed from "@/hooks/use-speed";
import useSlippage from "@/hooks/use-slippage";
import { formatUnits } from "viem";

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const [value, setValue] = useState<string>("");
	const wallets = useWallets();
	const { speed } = useSpeed();
	const { slippage } = useSlippage();
	const address = wallets?.solanaWallets?.Mainnet?.address as AddressLike;
	const balance = useBalance({ chain: token.chain, address });
	const tokenBalance = useTokenBalance({
		chain: token.chain,
		contractAddress: token.contractAddress,
		address: address,
	});

	const quickSetButtons = ["Reset", "0.1", "0.5", "1.0"];
	const quickSetSellButtons = ["Reset", 25, 50, 75, 100];

	const handleQuickSet = (val: string) => {
		const set = val === "Reset" ? "" : String(val);
		setValue(set);
	};

	const handleQuickSetSell = (val: string | number) => {
		if (val === "Reset") {
			return setValue("");
		}

		const balance = tokenBalance?.data;
		if (val === 100) {
			return setValue(String(balance));
		}

		const calc = balance * Number(`0.${val}`);
		return setValue(String(calc));
	};

	const minReceivedQuery = useQuery({
		queryKey: [token.contractAddress, mode, value, slippage],
		queryFn: async () => {
			try {
				return await retrieveQuote({
					amount: value,
					mode,
					slippage,
					token,
				});
			} catch (e) {
				const error = e as { message?: string };
				toast.error(error?.message);
				throw e;
			}
		},
		enabled: !!value,
		refetchInterval: 7_000,
	});

	const swapMutation = useMutation({
		mutationKey: [token.contractAddress, value, slippage, speed],
		mutationFn: async () => {
			await executeSwap(token, value, mode, slippage, speed);
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
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: explanation */}
					<span
						className="uppercase cursor-pointer"
						onClick={() => {
							if (mode === "buy") {
								setValue(String(balance?.data));
							} else {
								setValue(String(tokenBalance?.data));
							}
						}}
					>
						{mode === "buy" ? balance?.data : tokenBalance?.data ? abbreviateNumber(tokenBalance.data, true) : "-"}{" "}
						{mode === "buy" ? "SOL" : token.ticker}
					</span>
				</div>

				{mode === "buy" ? (
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
				) : (
					<div className="flex items-center gap-2 justify-between">
						{quickSetSellButtons.map((btn) => (
							<Button
								key={btn}
								variant="secondary"
								className={cn([
									"bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow h-[36px]",
									btn === "Reset" ? "text-autofun-text-secondary" : "",
								])}
								onClick={() => handleQuickSetSell(btn)}
							>
								{btn === "Reset" ? "Reset" : `${btn}%`}
							</Button>
						))}
					</div>
				)}

				<div className="mt-2 space-y-2">
					<div className="flex font-medium justify-between text-base text-white">
						<p>Min Received</p>
						<div className="flex items-center gap-2">
							{!value || value === "0" ? (
								<span>0</span>
							) : (
								<Fragment>
									{minReceivedQuery?.isPending || minReceivedQuery?.isRefetching ? (
										<Skeleton />
									) : (
										<Fragment>
											{minReceivedQuery?.error ? (
												<span>Error</span>
											) : (
												<span>
													{minReceivedQuery?.data?.minimumReceived
														? formatUnits(BigInt(minReceivedQuery?.data?.minimumReceived), token.decimals)
														: null}
												</span>
											)}
										</Fragment>
									)}
								</Fragment>
							)}

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
