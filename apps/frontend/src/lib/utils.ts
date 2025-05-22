import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";
import { clsx, type ClassValue } from "clsx";
import moment from "moment";
import { twMerge } from "tailwind-merge";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const abbreviateNumber = (num: number, withoutCurrency = false): string => {
	const absNum = Math.abs(Number(num));
	if (absNum < 1000) return formatNumber(num, false, withoutCurrency);

	const units = ["K", "M", "B", "T"];
	let exponent = Math.floor(Math.log10(absNum) / 3);
	if (exponent > units.length) exponent = units.length;
	const unit = units[exponent - 1];
	const scaled = absNum / 1000 ** exponent;
	const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

	return `${withoutCurrency ? "" : "$"}${(num < 0 ? "-" : "") + formatted + unit}`;
};

export const formatNumber = (num: number, showDecimals?: boolean, hideDollarSign?: boolean) => {
	const formatted = Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: showDecimals ? "standard" : "compact",
	}).format(num);

	if (hideDollarSign) {
		return formatted?.replace("$", "");
	}

	return formatted;
};

export const fromNow = (date: string | Date | number, hideAgo?: boolean): string => {
	const timeString = String(moment(date).fromNow());

	if (!hideAgo) {
		return timeString;
	}

	if (timeString.includes("a few seconds ago")) return "NOW";
	if (timeString.includes("a minute ago")) return "1m";
	if (timeString.includes("an hour ago")) return "1hr";
	if (timeString.includes("a day ago")) return "1d";
	if (timeString.includes("a week ago")) return "1w";
	if (timeString.includes("a month ago")) return "1mo";
	if (timeString.includes("a year ago")) return "1y";

	let result = timeString.replace("ago", "").trim();
	result = result.replace(" seconds", "s").replace(" second", "s");
	result = result.replace(" minutes", "m").replace(" minute", "m");
	result = result.replace(" hours", "hrs").replace(" hour", "hr");
	result = result.replace(" days", "d").replace(" day", "d");
	result = result.replace(" weeks", "w").replace(" week", "w");
	result = result.replace(" months", "mo").replace(" month", "mo");
	result = result.replace(" years", "y").replace(" year", "y");

	return result;
};

export const shortenAddress = (str: string): string => {
	const length = 5;
	return `${str.substring(0, length)}...${str.substring(str.length - length, str.length)}`;
};

export function getCoinGeckoChainName<T extends TChain>(
	chain: T,
	chainId: T extends "solana" ? SolanaNetworkIds : EvmChainIds,
): string | undefined {
	if (chain === "evm") {
		if (chainId === EvmChainIds.EthereumMainnet) {
			return "eth";
		}
		if (chainId === EvmChainIds.BaseMainnet) {
			return "base";
		}
	}
	if (chain === "solana") {
		if (chainId === SolanaNetworkIds.Mainnet) {
			return "solana";
		}
	}
	return undefined;
}

export const UniswapV2PairABI = [
	{
		type: "event",
		name: "Swap",
		inputs: [
			{ name: "sender", type: "address", indexed: true },
			{ name: "amount0In", type: "uint256", indexed: false },
			{ name: "amount1In", type: "uint256", indexed: false },
			{ name: "amount0Out", type: "uint256", indexed: false },
			{ name: "amount1Out", type: "uint256", indexed: false },
			{ name: "to", type: "address", indexed: true },
		],
	},
];

export const UniswapV3PoolABI = [
	{
		type: "event",
		name: "Swap",
		inputs: [
			{ type: "address", name: "sender", indexed: true },
			{ type: "address", name: "recipient", indexed: true },
			{ type: "int256", name: "amount0", indexed: false },
			{ type: "int256", name: "amount1", indexed: false },
			{ type: "uint160", name: "sqrtPriceX96", indexed: false },
			{ type: "uint128", name: "liquidity", indexed: false },
			{ type: "int24", name: "tick", indexed: false },
		],
		anonymous: false,
	},
];

export const formatUsd = (value: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(value);
};

export const getPercentageOfTotal = (value: number, max: number): number => {
	if (max === 0) {
		return 1;
	}
	const percentage = (value / max) * 100;
	return Math.max(1, Math.min(100, percentage));
};

export const signSolanaMessage = async (message: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => {
	const encoder = new TextEncoder();
	const encodedMessage = encoder.encode(message);
	const signature = await signMessage(encodedMessage);
	const base58Signature = bs58.encode(signature);
	return base58Signature;
};

export const signEVMMessage = async (message: string, signMessage: (message: string) => Promise<string>) => {
	const signature = await signMessage(message);
	return signature;
};
