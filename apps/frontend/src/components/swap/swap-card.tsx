"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import SwapInput from "@/components/swap/swap-input";
import Image from "next/image";
import type { IToken, AddressLike } from "@waifufun/types";
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
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import moment from "moment";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import Countdown from "react-countdown";
import { useTransactionListener } from "@/providers/transaction-listener";

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const [value, setValue] = useState<string>("");
	const queryClient = useQueryClient();
	const { isConnected } = useAccount();
	const { speed } = useSpeed();
	const { slippage } = useSlippage();
	const { openConnectModal } = useConnectModal();
	const address = useAddress();
	const { addTransaction } = useTransactionListener();
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

		const bal = tokenBalance?.data;
		if (val === 100) {
			return setValue(String(bal));
		}

		const calc = (bal ?? 0) * Number(`0.${val}`);
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
				});
			} catch (e) {
				const error = e as { message?: string };
				console.error(e);
				if (error?.message !== "Assertion failed") {
					toast.error(error?.message);
				}
				throw e;
			}
		},
		enabled: !!value,
		refetchInterval: 7_000,
	});

	const swapMutation = useMutation({
		mutationKey: [token.contractAddress, value, slippage, speed],
		mutationFn: async () => {
			const from = address as AddressLike;
			if (!from) throw new Error("No wallet connected");

			const inputAmountParsed = Number.parseFloat(value);
			const inputAmountWei = Math.floor(inputAmountParsed * 10 ** (mode === "buy" ? 18 : token.decimals));

			// TODO: Implement BSC swap execution via Flap
			return await executeSwap(
				from,
				token,
				value,
				mode,
				slippage,
				speed,
				(hash: string, expectedOutput: number) => {
					addTransaction(hash, token, mode, inputAmountWei, expectedOutput);
				},
			);
		},
		onSuccess: () => {
			setTimeout(() => {
				queryClient.invalidateQueries({
					queryKey: ["balance"],
				});
				queryClient.invalidateQueries({
					queryKey: ["chart"],
				});
				queryClient.invalidateQueries({
					queryKey: ["trades"],
				});

				tokenBalance.refetch();
				balance.refetch();
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
			return Number(balance?.data) >= Number(value);
		}

		return Number(tokenBalance?.data) >= Number(value);
	};

	const insufficientBalance = !hasSufficientBalance();
	const maxBuyAmount =
		token?.maxBuyAmount &&
		moment(token.tradingStartsAt || token.createdAt)
			.add(8, "hours")
			.isBefore(moment())
			? formatUnits(BigInt(token?.maxBuyAmount), 18)
			: false;

	const isTooHighBuyAmount = () => {
		if (!value || value === "0") return false;
		if (!maxBuyAmount) return false;
		if (mode === "buy") {
			return Number(value) > Number(maxBuyAmount);
		}

		return false;
	};

	const tooHighBuyAmount = isTooHighBuyAmount();
	const tradingStarted = token?.tradingStartsAt ? moment(token?.tradingStartsAt).isBefore(moment()) : true;

	return (
		<div className="w-full h-full overflow-hidden">
			<div className="flex flex-col gap-2">
				<div className="flex items-stretch gap-2 w-full bg-[#08080a] border border-[rgba(255,255,255,0.06)] py-3 px-1.5 rounded-sm">
					<SwapInput align="left" value={value} onUserInput={setValue} className="w-full" />
					<div className="flex flex-row gap-x-1 mr-2 justify-end items-center w-1/4">
						<Image
							unoptimized
							priority
							className="rounded-md size-6"
							src={mode === "buy" ? "/chain-icons/bsc.svg" : token.image}
							alt={token?.ticker || "token"}
							width={24}
							height={24}
						/>
						<span className="uppercase">{mode === "buy" ? "BNB" : token.ticker}</span>
					</div>
				</div>
				<div
					className={cn([
						"flex flex-row gap-x-1 justify-end items-center w-full mr-5 gap-1 text-[#8C8C8C] text-sm font-medium transition-opacity duration-200",
						!address ? "opacity-0 h-0" : "opacity-100",
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
						{mode === "buy" ? "BNB" : token.ticker}
					</span>
				</div>

				{mode === "buy" ? (
					<div className="flex items-center gap-2 justify-between w-full overflow-x-auto whitespace-nowrap">
						{quickSetButtons.map((btn) => (
							<Button
								key={btn}
								variant="secondary"
								className={cn([
									"bg-gradient-to-t from-[#121212] to-[#171717] text-sm grow h-[36px] border border-transparent hover:border-waifufun-background-action-highlight transition-colors duration-200",
									btn === "Reset" ? "text-waifufun-text-secondary" : "",
								])}
								onClick={() => handleQuickSet(btn)}
							>
								{btn}
							</Button>
						))}
					</div>
				) : (
					<Fragment>
						{address && tokenBalance?.data ? (
							<div className="grid grid-cols-5 gap-1">
								{quickSetSellButtons.map((btn) => (
									<Button
										key={btn}
										variant="secondary"
										className={cn([
											"bg-gradient-to-t from-[#121212] to-[#171717] text-xs sm:text-sm h-[36px] px-1 sm:px-2 border border-transparent hover:border-waifufun-background-action-highlight transition-colors duration-200",
											btn === "Reset" ? "text-waifufun-text-secondary" : "",
										])}
										onClick={() => handleQuickSetSell(btn)}
									>
										<span className="truncate">{btn === "Reset" ? "Reset" : `${btn}%`}</span>
									</Button>
								))}
							</div>
						) : null}
					</Fragment>
				)}

				<div className="mt-2 space-y-2">
					<div className="flex font-medium justify-between text-xs text-white">
						<p>Min Received</p>
						<div className="flex items-center gap-2">
							{!value || value === "0" ? (
								<span>0</span>
							) : (
								<Fragment>
									{minReceivedQuery?.isPending ? (
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
														? formatUnits(
																BigInt(minReceivedQuery?.data?.minimumReceived),
																mode === "sell" ? 18 : token.decimals,
															)
														: null}
												</span>
											)}
										</Fragment>
									)}
								</Fragment>
							)}

							{mode === "buy" ? token.ticker : "BNB"}
						</div>
					</div>
					{priceImpact ? (
						<div className="flex font-medium justify-between text-white text-xs">
							<p>Price Impact</p>
							<p className={cn([priceImpact > 50 ? "text-red-400" : ""])}>~ {priceImpact}%</p>
						</div>
					) : null}
					<AdvancedSettings />
					<div
						className={cn([
							tooHighBuyAmount && address
								? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
								: "hidden",
							"p-2 w-full bg-[#111114] text-xs gap-2 items-center transition-all duration-200",
						])}
					>
						<AlertCircle className="text-waifufun-text-error" />
						You are trying to buy too much. Max allowed is: {maxBuyAmount} BNB
					</div>
					<div
						className={cn([
							insufficientBalance && address
								? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
								: "hidden",
							"p-2 w-full bg-[#111114] text-xs gap-2 items-center transition-all duration-200",
						])}
					>
						<AlertCircle className="text-waifufun-text-error" />
						Insufficient balance to perform trade.
					</div>
					{tradingStarted ? (
						<Button
							disabled={
								token.status === "migrating" ||
								(address
									? swapMutation?.isPending || tooHighBuyAmount || insufficientBalance || !value || value === "0"
									: false)
							}
							onClick={() => {
								if (!address) {
									openConnectModal?.();
								} else {
									swapMutation?.mutate();
								}
							}}
							className="w-full mt-2 text-base font-medium bg-[#111114] border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] text-white uppercase"
						>
							{token.status === "migrating"
								? "Token migrating"
								: !address
									? "Connect"
									: swapMutation?.isPending
										? "Loading..."
										: insufficientBalance
											? "Insufficient balance"
											: tooHighBuyAmount
												? "Amount too high"
												: "Swap"}
						</Button>
					) : (
						<Tooltip>
							<TooltipTrigger className="w-full">
								<Button
									disabled
									className="w-full mt-2 text-base font-medium bg-[#111114] border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] text-white uppercase"
								>
									<Countdown
										date={moment(token?.tradingStartsAt).toDate()}
										intervalDelay={0}
										onComplete={() => {
											console.log("Trading has started");
											setTimeout(() => {
												queryClient.invalidateQueries({
													queryKey: ["token", token.chain, token.chainId, token.contractAddress],
												});
											}, 1000);
										}}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Trading starts: {moment(token?.tradingStartsAt)?.format("LLL")}</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
		</div>
	);
}
