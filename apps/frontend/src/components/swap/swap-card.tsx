"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
import { useConnectModal } from "@rainbow-me/rainbowkit";
import moment from "moment";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import Countdown from "react-countdown";
import { useTransactionListener } from "@/providers/transaction-listener";
import { useTranslation } from "@/contexts/locale-context";

function parseNumericInput(value: string) {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export default function SwapCard({ token, mode }: { token: IToken; mode: "buy" | "sell" }) {
	const { t } = useTranslation();
	const [value, setValue] = useState<string>("");
	const queryClient = useQueryClient();
	const { speed } = useSpeed();
	const { slippage } = useSlippage();
	const { openConnectModal } = useConnectModal();
	const address = useAddress();
	const { addTransaction } = useTransactionListener();
	const balance = useBalance({ chain: token.chain, address });
	const tokenBalance = useTokenBalance({
		chain: token.chain,
		contractAddress: token.contractAddress,
		address,
	});

	const resetLabel = t("swap.reset");
	const quickSetButtons = [resetLabel, "0.1", "0.5", "1.0"];
	const quickSetSellButtons = [resetLabel, 25, 50, 75, 100];
	const isDexSwapAvailable = token.status === "migrated" || token.status === "dex";
	const normalizedSlippage = slippage / 10;
	const numericValue = parseNumericInput(value);
	const hasInputAmount = numericValue > 0;

	const handleQuickSet = (val: string) => {
		const set = val === resetLabel ? "" : String(val);
		setValue(set);
	};

	const handleQuickSetSell = (val: string | number) => {
		if (val === resetLabel) {
			setValue("");
			return;
		}

		const currentBalance = Number(tokenBalance?.data ?? 0);
		if (!currentBalance) {
			return;
		}

		if (val === 100) {
			setValue(String(currentBalance));
			return;
		}

		const calc = currentBalance * (Number(val) / 100);
		setValue(String(calc));
	};

	const minReceivedQuery = useQuery({
		queryKey: ["quote", token.contractAddress, mode, value, normalizedSlippage, isDexSwapAvailable],
		queryFn: async () => {
			try {
				return await retrieveQuote({
					amount: value,
					mode,
					slippage: normalizedSlippage,
					token,
				});
			} catch (error) {
				console.error("[swap-card] quote retrieval failed", error);
				throw error;
			}
		},
		enabled: hasInputAmount && isDexSwapAvailable,
		refetchInterval: 7_000,
	});

	const swapMutation = useMutation({
		mutationKey: [token.contractAddress, value, normalizedSlippage, speed],
		mutationFn: async () => {
			const from = address as AddressLike;
			if (!from) throw new Error("No wallet connected");
			if (!isDexSwapAvailable) {
				throw new Error("Direct bonding curve swaps are not wired up yet.");
			}

			const inputAmountWei = Math.floor(numericValue * 10 ** (mode === "buy" ? 18 : token.decimals));

			return await executeSwap(
				from,
				token,
				value,
				mode,
				normalizedSlippage,
				speed,
				(hash: string, expectedOutput: number) => {
					addTransaction(hash, token, mode, inputAmountWei, expectedOutput);
				},
			);
		},
		onSuccess: (result) => {
			if (result === "redirect_to_pancakeswap") {
				toast.info(mode === "buy" ? "Opening PancakeSwap to buy." : "Opening PancakeSwap to sell.");
				return;
			}

			setTimeout(() => {
				queryClient.invalidateQueries({ queryKey: ["balance"] });
				queryClient.invalidateQueries({ queryKey: ["chart"] });
				queryClient.invalidateQueries({ queryKey: ["trades"] });
				tokenBalance.refetch();
				balance.refetch();
			}, 1500);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const priceImpact = minReceivedQuery.data?.priceImpactPct
		? Number((Number(minReceivedQuery.data.priceImpactPct) * 100).toFixed(0))
		: null;

	useEffect(() => {
		setValue("");
	}, [mode]);

	const hasSufficientBalance = () => {
		if (!hasInputAmount) return true;
		if (mode === "buy") {
			return Number(balance?.data ?? 0) >= numericValue;
		}

		return Number(tokenBalance?.data ?? 0) >= numericValue;
	};

	const insufficientBalance = !hasSufficientBalance();
	const maxBuyAmount =
		token?.maxBuyAmount &&
		moment(token.tradingStartsAt || token.createdAt)
			.add(8, "hours")
			.isBefore(moment())
			? formatUnits(BigInt(token.maxBuyAmount), 18)
			: false;

	const isTooHighBuyAmount = () => {
		if (!hasInputAmount) return false;
		if (!maxBuyAmount) return false;
		if (mode === "buy") {
			return numericValue > Number(maxBuyAmount);
		}

		return false;
	};

	const tooHighBuyAmount = isTooHighBuyAmount();
	const tradingStarted = token?.tradingStartsAt ? moment(token.tradingStartsAt).isBefore(moment()) : true;
	const displayedBalance = mode === "buy" ? Number(balance?.data ?? 0) : Number(tokenBalance?.data ?? 0);
	const minReceivedText = useMemo(() => {
		if (!isDexSwapAvailable || !minReceivedQuery.data?.minimumReceived) {
			return null;
		}

		return formatUnits(
			BigInt(minReceivedQuery.data.minimumReceived),
			mode === "sell" ? 18 : token.decimals,
		);
	}, [isDexSwapAvailable, minReceivedQuery.data?.minimumReceived, mode, token.decimals]);

	const primaryButtonLabel = token.status === "migrating"
		? t("swap.tokenMigrating")
		: !address
			? t("swap.connect")
			: !isDexSwapAvailable
				? "Direct swap soon"
				: swapMutation.isPending
					? t("common.loading")
					: insufficientBalance
						? t("swap.insufficientBalance")
						: tooHighBuyAmount
							? t("swap.amountTooHigh")
							: mode === "buy"
								? "Buy on PancakeSwap"
								: "Sell on PancakeSwap";

	return (
		<div className="h-full w-full overflow-hidden">
			<div className="flex flex-col gap-2">
				<div className="flex w-full items-stretch gap-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-1.5 py-3">
					<SwapInput
						align="left"
						value={value}
						onUserInput={setValue}
						maxDecimals={mode === "buy" ? 18 : token.decimals}
						className="w-full"
					/>
					<div className="mr-2 flex w-1/4 items-center justify-end gap-1 font-mono">
						<Image
							unoptimized
							priority
							className="size-6 rounded-sm"
							src={mode === "buy" ? "/chain-icons/bsc.svg" : token.image}
							alt={token?.ticker || "token"}
							width={24}
							height={24}
						/>
						<span className="uppercase text-[#e4e4e7]">{mode === "buy" ? "BNB" : token.ticker}</span>
					</div>
				</div>
				<div
					className={cn(
						"mr-5 flex w-full items-center justify-end gap-1 text-sm font-medium text-[#8C8C8C] transition-opacity duration-200",
						!address ? "h-0 opacity-0" : "opacity-100",
					)}
				>
					<Wallet size={14} color="#8C8C8C" />
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: balance row acts as a quick-fill affordance */}
					<span
						className="cursor-pointer font-mono uppercase"
						onClick={() => {
							if (!Number.isFinite(displayedBalance)) return;
							setValue(String(displayedBalance));
						}}
					>
						{mode === "buy"
							? displayedBalance.toFixed(4)
							: tokenBalance?.data
								? abbreviateNumber(Number(tokenBalance.data), true)
								: "-"}{" "}
						{mode === "buy" ? "BNB" : token.ticker}
					</span>
				</div>

				{mode === "buy" ? (
					<div className="flex w-full items-center justify-between gap-2 overflow-x-auto whitespace-nowrap">
						{quickSetButtons.map((btn) => (
							<Button
								key={btn}
								variant="secondary"
								className={cn(
									"h-[36px] grow rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#08080a] font-mono text-sm text-[#e4e4e7] transition-colors duration-200 hover:border-[#00ff87] hover:bg-[#111114]",
									btn === resetLabel ? "text-[#8C8C8C]" : "",
								)}
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
										className={cn(
											"h-[36px] rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#08080a] px-1 font-mono text-xs text-[#e4e4e7] transition-colors duration-200 hover:border-[#ef4444] hover:bg-[#111114] sm:px-2 sm:text-sm",
											btn === resetLabel ? "text-[#8C8C8C]" : "",
										)}
										onClick={() => handleQuickSetSell(btn)}
									>
										<span className="truncate">{btn === resetLabel ? resetLabel : `${btn}%`}</span>
									</Button>
								))}
							</div>
						) : null}
					</Fragment>
				)}

				<div className="mt-2 space-y-2">
					<div className="flex justify-between text-xs font-medium text-white">
						<p>{t("swap.minReceived")}</p>
						<div className="flex items-center gap-2 font-mono">
							{!hasInputAmount ? (
								<span>0</span>
							) : !isDexSwapAvailable ? (
								<span className="text-[#8C8C8C]">—</span>
							) : minReceivedQuery.isPending ? (
								<Skeleton />
							) : minReceivedQuery.error ? (
								<span className="text-[#8C8C8C]">{t("swap.priceUnavailable")}</span>
							) : (
								<span className="animate-fade animate-once animate-duration-200 animate-ease-linear" key={minReceivedText || "0"}>
									{minReceivedText || "0"}
								</span>
							)}
							{mode === "buy" ? token.ticker : "BNB"}
						</div>
					</div>
					{priceImpact !== null ? (
						<div className="flex justify-between text-xs font-medium text-white">
							<p>{t("swap.priceImpact")}</p>
							<p className={cn("font-mono", priceImpact > 50 ? "text-red-400" : "text-[#00ff87]")}>~ {priceImpact}%</p>
						</div>
					) : null}
					<AdvancedSettings />
					<div
						className={cn(
							!isDexSwapAvailable ? "inline-flex" : "hidden",
							"w-full items-center gap-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-2 text-xs text-[#a1a1aa]",
						)}
					>
						<AlertCircle className="text-[#ef4444]" />
						Bonding curve swaps are not connected yet. Migrated tokens open on PancakeSwap.
					</div>
					<div
						className={cn(
							tooHighBuyAmount && address
								? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
								: "hidden",
							"w-full items-center gap-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-2 text-xs",
						)}
					>
						<AlertCircle className="text-[#ef4444]" />
						{t("swap.maxBuyWarning", { max: String(maxBuyAmount) })}
					</div>
					<div
						className={cn(
							insufficientBalance && address
								? "inline-flex animate-fade animate-once animate-duration-200 animate-ease-linear"
								: "hidden",
							"w-full items-center gap-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-2 text-xs",
						)}
					>
						<AlertCircle className="text-[#ef4444]" />
						{t("swap.insufficientBalanceMessage")}
					</div>
					{tradingStarted ? (
						<Button
							disabled={
								token.status === "migrating" ||
								(address
									? swapMutation.isPending || tooHighBuyAmount || insufficientBalance || !hasInputAmount || !isDexSwapAvailable
									: false)
							}
							onClick={() => {
								if (!address) {
									openConnectModal?.();
								} else {
									swapMutation.mutate();
								}
							}}
							className="mt-2 w-full rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] text-base font-medium uppercase text-white hover:border-[#00ff87]"
						>
							{primaryButtonLabel}
						</Button>
					) : (
						<Tooltip>
							<TooltipTrigger className="w-full">
								<Button
									disabled
									className="mt-2 w-full rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] text-base font-medium uppercase text-white hover:border-[#00ff87]"
								>
									<Countdown
										date={moment(token?.tradingStartsAt).toDate()}
										intervalDelay={0}
										onComplete={() => {
											setTimeout(() => {
												queryClient.invalidateQueries({
													queryKey: ["token", token.chain, token.chainId, token.contractAddress],
												});
											}, 1000);
										}}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{t("swap.tradingStarts")}: {moment(token?.tradingStartsAt)?.format("LLL")}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
		</div>
	);
}
