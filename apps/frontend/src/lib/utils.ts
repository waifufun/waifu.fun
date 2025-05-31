import { EvmChainIds, SolanaNetworkIds, type IToken, type TChain } from "@autofun/types";
import { clsx, type ClassValue } from "clsx";
import moment from "moment";
import { twMerge } from "tailwind-merge";
import bs58 from "bs58";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const abbreviateNumber = (num: number, withoutCurrency = false): string => {
	const absNum = Math.abs(Number(num));
	if (absNum < 1000) return formatNumber(num, false, withoutCurrency);

	const units = ["k", "m", "b", "t"];
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

const toSubscript = (num: number): string => {
	const subDigits: { [key: string]: string } = {
		"0": "\u2080",
		"1": "\u2081",
		"2": "\u2082",
		"3": "\u2083",
		"4": "\u2084",
		"5": "\u2085",
		"6": "\u2086",
		"7": "\u2087",
		"8": "\u2088",
		"9": "\u2089",
		"-": "\u207B",
	};
	return num
		.toString()
		.split("")
		.map((digit) => subDigits[digit] || digit)
		.join("");
};

export const formatNumberSubscript = (inputNum: number, decimals = 1): string => {
	let num = inputNum;
	if (num === 0) return "0";
	let sign = "";
	if (num < 0) {
		sign = "-";
		num = Math.abs(num);
	}

	num = Number(num.toFixed(11));

	if (num >= 1) {
		return sign + num.toString();
	}

	const expStr = num.toExponential();
	const [mantissa, exponentStr] = expStr.split("e");
	if (!exponentStr || !mantissa) return "-";
	const exponent = Number.parseInt(exponentStr, 10);
	let totalZeros = -exponent - 1;
	const mantissaDigits = mantissa.replace(".", "").slice(0, 9);

	if (totalZeros < 0) {
		totalZeros = 0;
	}

	if (totalZeros > decimals) {
		return `${sign}0.0${toSubscript(totalZeros)}${mantissaDigits}`;
	}
	return `${sign}0.${"0".repeat(totalZeros)}${mantissaDigits}`;
};

export const fileToBase64 = (file: File): Promise<string | ArrayBuffer | null> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => resolve(reader.result);
		reader.onerror = (error) => reject(error);
	});
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

export const roundDownToNearest = (value: number, step: number): number => {
	if (step <= 0) {
		throw new Error("Step must be greater than zero");
	}
	return Math.floor(value / step) * step;
};

export function isInputGreaterThanDecimals(value: string, maxDecimals?: number): boolean {
	const decimalGroups = value.split(".");
	const decimalPart = decimalGroups[1] ?? "";
	return !!maxDecimals && decimalPart.length > maxDecimals;
}

export const executeSwap = async (token: IToken, inputAmount: bigint | string | number, mode: "buy" | "sell") => {
	/** If the token was imported or has already migrated we can just use Jupiter */
	if ((token?.imported || token?.curveCompleted) && token.chain === "solana") {
	}
	/** If the token was not imported, the curve hasn't completed and it's Solana we use our program */
	if (!token?.imported && !token?.curveCompleted && token.chain === "solana") {
	}

	throw new Error("No route found for token to swap against. Contact autofun.");
};
