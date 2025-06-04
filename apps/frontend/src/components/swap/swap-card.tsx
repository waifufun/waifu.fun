"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { IToken, SolanaAddressLike } from "@autofun/types";
import { AlertCircle, Wallet } from "lucide-react";
import AdvancedSettings from "./advanced-settings";
import { abbreviateNumber, cn, executeSwap, retrieveQuote } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Skeleton from "../skeleton-loading";
import useBalance from "@/hooks/use-balance";
import useTokenBalance from "@/hooks/use-token-balance";
import useSpeed from "@/hooks/use-speed";
import useSlippage from "@/hooks/use-slippage";
import { formatUnits } from "viem";
import useAddress from "@/hooks/use-address";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const [value, setValue] = useState<string>("");
	const queryClient = useQueryClient();
	const wallet = useWallet();
	const { speed } = useSpeed();
	const { connection } = useConnection();
	const { slippage } = useSlippage();
	const modal = useWalletModal();
	const address = useAddress();
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
		queryKey: ["quote", token.contractAddress, mode, value, slippage],
		queryFn: async () => {
			try {
				return await retrieveQuote({
					amount: value,
					mode,
					slippage,
					token,
					wallet,
					connection,
				});
			} catch (e) {
				const error = e as { message?: string };
				console.error(e);
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
			const from = address as SolanaAddressLike;
			if (!from) throw new Error("No wallet connected");
			return await executeSwap(from, token, value, mode, slippage, speed, connection, wallet);
		},
		onSuccess: (signature: string) => {
			toast(`Sent transaction ${signature}`);
			setTimeout(() => {
				queryClient.invalidateQueries({
					queryKey: ["balance"],
				});
			}, 1500);
		},
		onError: (e) => {
			toast.error(e.message);
		},
	});

	const priceImpact = minReceivedQuery?.data?.priceImpactPct
		? Number((Number(minReceivedQuery?.data?.priceImpactPct) * 100).toFixed(0))
		: null;

	useEffect(() => {
		if (mode) {
			setValue("");
		}
	}, [mode]);

	const hasSufficientBalance = () => {
		if (!value || value === "0") return true;
		if (mode === "buy") {
			console.log(balance?.data, value);
			return Number(balance?.data) >= Number(value);
		}

		return Number(tokenBalance?.data) >= Number(value);
	};

	const insufficientBalance = !hasSufficientBalance();

	return (
		<div className="w-full h-full overflow-hidden">
			<div className="flex flex-col gap-2">
				<div className="flex items-stretch gap-2 w-full">
					<SwapInput align="left" value={value} onUserInput={setValue} className="w-full" />
					<div className="flex flex-row gap-x-1 mr-2 justify-end items-center w-1/4">
						<Image
							unoptimized
							priority
							className="rounded-md size-6"
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
				<div
					className={cn([
						"flex flex-row gap-x-1 justify-end items-center w-full mr-5 gap-1 text-[#8C8C8C] text-sm font-medium transition-opacity duration-200",
						!address ? "opacity-0" : "opacity-100",
					])}
				>
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
									"bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow h-[36px] border border-transparent hover:border-autofun-background-action-highlight transition-colors duration-200",
									btn === "Reset" ? "text-autofun-text-secondary" : "",
								])}
								onClick={() => handleQuickSet(btn)}
							>
								{btn}
							</Button>
						))}
					</div>
				) : (
					<div className="flex items-center gap-2 justify-between overflow-x-auto">
						{quickSetSellButtons.map((btn) => (
							<Button
								key={btn}
								variant="secondary"
								className={cn([
									"bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow h-[36px]  border border-transparent hover:border-autofun-background-action-highlight transition-colors duration-200",
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
												<span
													className="animate-fade animate-once animate-duration-200 animate-ease-linear"
													key={minReceivedQuery?.data?.minimumReceived || "0"}
												>
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
					{priceImpact ? (
						<div className="flex font-medium justify-between text-base text-white">
							<p>Price Impact</p>
							<p className={cn([priceImpact > 50 ? "text-red-400" : ""])}>~ {priceImpact}%</p>
						</div>
					) : null}
					<AdvancedSettings />
					<div
						className={cn([
							insufficientBalance && address
								? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
								: "hidden",
							"p-2 w-full bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] rounded-xl text-sm gap-2 items-center transition-all duration-200",
						])}
					>
						<AlertCircle className="text-autofun-text-error" />
						Insufficient balance to perform trade.
					</div>
					<Button
						disabled={address ? swapMutation?.isPending || insufficientBalance || !value || value === "0" : false}
						onClick={() => {
							if (!address) {
								modal.setVisible(true);
							} else {
								swapMutation?.mutate();
							}
						}}
						className="w-full mt-2 text-base font-medium bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] hover:border hover:border-[#03FF24] text-white uppercase"
					>
						{!address
							? "Connect"
							: swapMutation?.isPending
								? "Loading..."
								: insufficientBalance
									? "Insufficient balance"
									: "Swap"}
					</Button>
				</div>
			</div>
		</div>
	);
}
