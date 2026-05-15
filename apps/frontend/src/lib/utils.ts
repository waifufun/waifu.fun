import type { TSpeed } from "@/hooks/use-speed";
import { type AddressLike, EvmChainIds, type IToken, SolanaNetworkIds, type TChain } from "@waifufun/types";
import { type ClassValue, clsx } from "clsx";
import moment from "moment";
import { twMerge } from "tailwind-merge";

import type { TokenMetadata } from "@/components/hooks/providers/usePromptContext";

export type CreateTokenResponse = {
	contractAddress: string;
	txHash: string;
};

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Virtual reserves constant - kept for bonding curve UI math */
export const virtualReservesConst = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 2800000000 : 28000000000;

/** Curve limit constant - kept for bonding curve UI math */
export const curveLimitConst = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 11300000000 : 113000000000;

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

export const isSameWalletAddress = (left?: string | null, right?: string | null): boolean => {
	if (!left || !right) return false;

	const normalizedLeft = left.trim();
	const normalizedRight = right.trim();
	const isEvmAddress = normalizedLeft.startsWith("0x") || normalizedRight.startsWith("0x");

	return isEvmAddress
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
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

/**
 * Retrieve a swap quote using DexScreener API for price data.
 * Calculates expected output and minimum received based on current market price.
 */
export const retrieveQuote = async ({
	amount,
	token,
	mode,
	slippage,
}: {
	amount: string | number;
	token: IToken;
	mode: "buy" | "sell";
	slippage: number;
}): Promise<{
	minimumReceived: number;
	swapUsdValue?: string;
	priceImpactPct?: string;
	quote?: unknown;
}> => {
	try {
		// Fetch current price from DexScreener
		const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.contractAddress}`);

		if (!resp.ok) {
			throw new Error("Failed to fetch price data");
		}

		const data = await resp.json();
		const pair = data.pairs?.[0];

		if (!pair) {
			throw new Error("Price unavailable");
		}

		const priceUsd = Number.parseFloat(pair?.priceUsd || "0");
		const bnbPriceUsd = Number.parseFloat(pair?.priceNative || "0");

		if (priceUsd === 0) {
			throw new Error("Price unavailable");
		}

		const inputAmount = Number.parseFloat(String(amount));

		if (Number.isNaN(inputAmount) || inputAmount <= 0) {
			throw new Error("Invalid amount");
		}

		let outputAmount: number;
		let swapUsdValue: string;

		if (mode === "buy") {
			// Buying tokens with BNB
			// Get BNB price in USD (from pair or default BSC price)
			const bnbPrice = bnbPriceUsd > 0 ? priceUsd / bnbPriceUsd : 300; // Fallback BNB price
			const inputUsd = inputAmount * bnbPrice;
			outputAmount = inputUsd / priceUsd;
			swapUsdValue = inputUsd.toFixed(2);
		} else {
			// Selling tokens for BNB
			const outputUsd = inputAmount * priceUsd;
			const bnbPrice = bnbPriceUsd > 0 ? priceUsd / bnbPriceUsd : 300;
			outputAmount = outputUsd / bnbPrice;
			swapUsdValue = outputUsd.toFixed(2);
		}

		// Apply slippage tolerance
		const slippageMultiplier = 1 - slippage / 100;
		const minimumReceived = Math.floor(
			outputAmount * slippageMultiplier * (mode === "buy" ? 10 ** token.decimals : 10 ** 18),
		);

		// Estimate price impact (simplified - real calculation would need liquidity depth)
		const priceImpactPct = "1"; // Conservative estimate, real calc needs pool liquidity

		return {
			minimumReceived,
			swapUsdValue,
			priceImpactPct,
			quote: pair,
		};
	} catch (error) {
		console.error("[BSC] retrieveQuote error:", error);
		throw error;
	}
};

/**
 * Execute a swap by redirecting to PancakeSwap.
 * For migrated/dex tokens, opens PancakeSwap with pre-filled parameters.
 * For bonding curve tokens, shows message about upcoming direct swap.
 */
export const executeSwap = async (
	from: AddressLike,
	token: IToken,
	inputAmount: string | number,
	mode: "buy" | "sell",
	slippage: number,
	speed: TSpeed,
	onTransactionStart?: (hash: string, expectedOutput: number) => void,
): Promise<string> => {
	// Check if token is migrated to DEX
	const isMigrated = token.status === "migrated" || token.status === "dex";

	if (isMigrated) {
		// Redirect to PancakeSwap for migrated tokens
		const pancakeUrl = `https://pancakeswap.finance/swap?outputCurrency=${token.contractAddress}&chain=bsc`;
		window.open(pancakeUrl, "_blank");

		// Sentinel value: the caller checks for this to distinguish a DEX redirect from a real swap
		return "redirect_to_pancakeswap";
	}
	// For bonding curve tokens, show message
	throw new Error("Direct swap coming soon. Use PancakeSwap for now.");
};

/**
 * Token creation now happens directly via wagmi writeContract in the LaunchButton component.
 * This function is kept for type compatibility but should not be called directly.
 */
export const createTokenTx = async (tokenData: TokenMetadata): Promise<CreateTokenResponse> => {
	throw new Error("Use LaunchButton component which calls Portal.newTokenV5 via wagmi directly");
};

export const resizeImage = (url: string, width: number, height: number) => {
	if (!url) return "/logo.png";
	if (url.includes("ipfs") || !url.startsWith("http")) {
		return url;
	}
	return `https://waifu.fun/cdn-cgi/image/width=${width},height=${height},format=png/${url}`;
};

/**
 * Format a unix timestamp (ms) as a short relative time string:
 * "just now" | "2m ago" | "3h ago" | "2d ago" | "6w ago" | "3mo ago" | "1y ago"
 */
export function timeAgo(ts: number | undefined | null): string {
	if (!ts || !Number.isFinite(ts)) return "–";
	const diff = Math.max(0, Date.now() - ts);
	const s = Math.floor(diff / 1000);
	if (s < 30) return "just now";
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const w = Math.floor(d / 7);
	if (w < 5) return `${w}w ago`;
	const mo = Math.floor(d / 30);
	if (mo < 12) return `${mo}mo ago`;
	const y = Math.floor(d / 365);
	return `${y}y ago`;
}

/**
 * Shorten an Ethereum-style address like 0x1234…abcd.
 */
export function shortAddress(addr: string | undefined | null, chars = 4): string {
	if (!addr) return "–";
	if (addr.length <= chars * 2 + 2) return addr;
	return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}
