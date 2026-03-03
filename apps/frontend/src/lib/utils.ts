import { EvmChainIds, SolanaNetworkIds, type AddressLike, type IToken, type TChain } from "@waifufun/types";
import { clsx, type ClassValue } from "clsx";
import moment from "moment";
import { twMerge } from "tailwind-merge";
import bs58 from "bs58";
import type { TSpeed } from "@/hooks/use-speed";
import { parseUnits } from "viem";
import {
	ComputeBudgetProgram,
	Keypair,
	PublicKey,
	type TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
	Connection,
	Transaction,
	LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import { AnchorProvider, BN, type Program } from "@coral-xyz/anchor";

import type { WalletContextState } from "@solana/wallet-adapter-react";

import type { TokenMetadata } from "@/components/hooks/providers/usePromptContext";

import { getLaunchAccounts } from "./pdas";
import {
	createCurrentAutofunProgramWithProvider,
	createLegacyAutofunProgramWithProvider,
	type CurrentAutofunTypes,
	type LegacyAutofunTypes,
} from "@waifufun/programs";

export type CreateTokenResponse = {
	mintPublicKey: PublicKey;
	userPublicKey: PublicKey;
	signature: string;
};

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const virtualReservesConst = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 2800000000 : 28000000000;

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
		"0": "₀",
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

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const platformFeeBps = 100;
const feeAccount = new PublicKey("autovtovm7oqwtbyrWgdSH7i1W4nLPRWjXM2wcdqn1R");
/** Fee token account, used for Jupiter's platform fees */
const feeTokenAccount = new PublicKey("DxkyyA3Gwt7RpgupCHEZX2y653Mg2byEMTm1ikxaTDR");

export const retrieveJupiterQuote = async ({
	amount,
	token,
	mode,
	slippage,
}: {
	amount: string | number;
	token: IToken;
	mode: "buy" | "sell";
	slippage: number;
	// biome-ignore lint/suspicious/noExplicitAny: allow
}): Promise<{ minimumReceived: number; swapUsdValue?: string; priceImpactPct?: string; quote?: any }> => {
	const isToken2022 = token?.isToken2022 || false;
	const inputMint = mode === "buy" ? SOL_MINT_ADDRESS : token.contractAddress;
	const outputMint = mode === "buy" ? token.contractAddress : SOL_MINT_ADDRESS;
	const amountW = parseUnits(String(amount), mode === "buy" ? 9 : token.decimals);

	const res = await fetch(
		`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountW}&slippageBps=${slippage}${!isToken2022 ? `&platformFeeBps=${platformFeeBps}` : ""}`,
		{
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		},
	);

	const json = await res.json();

	const minimumReceived = json?.outAmount;
	const swapUsdValue = json?.swapUsdValue;
	const priceImpactPct = json?.priceImpactPct;

	return { minimumReceived, swapUsdValue, priceImpactPct, quote: json };
};

const convertToBasisPoints = (feePercent: number): number => {
	// Validate that feePercent is reasonable
	if (feePercent < 0) {
		console.warn(`Invalid fee percent: ${feePercent}, using 0 as fallback`);
		return 0;
	}

	// If feePercent is already in basis points (e.g., 100 = 1%), return it directly
	if (feePercent <= 10000) {
		return Math.floor(feePercent);
	}

	// If feePercent is a percentage (e.g., 1.5 = 1.5%), convert to basis points
	if (feePercent <= 100) {
		return Math.floor(feePercent * 100);
	}

	// If it's a very large number, assume it's already in basis points but needs to be capped
	console.warn(`Very large fee percent: ${feePercent}, capping at 10000 basis points`);
	return Math.min(10000, Math.floor(feePercent));
};

export const retrieveAutofunQuote = async ({
	wallet,
	connection,
	slippage,
	amount,
	mode,
	token,
}: {
	amount: string | number;
	wallet: WalletContextState;
	slippage: number | string;
	connection: Connection;
	token: IToken;
	mode: "buy" | "sell";
}) => {
	if (!amount) throw new Error("Invalid amount passed");
	const HELIUS_RPC_URL =
		token?.chainId === SolanaNetworkIds.Devnet
			? `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
			: `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

	connection = new Connection(HELIUS_RPC_URL, "finalized");
	const { program, configAccount } = await getAutofunProgram(connection, wallet, token.version);
	const contractAddress = token.contractAddress;
	const FEE_BASIS_POINTS = 10000;
	const curve = await getBondingCurvePDA(program, contractAddress);
	const reserveToken = curve.reserveToken;
	const reserveLamport = curve.reserveLamport;

	// Try to safely convert BN to number, with fallback
	let feePercent: number;
	const rawFeeString =
		mode === "sell" ? configAccount.platformSellFee.toString() : configAccount.platformBuyFee.toString();

	// Check if the BN represents a reasonable fee value
	if (rawFeeString === "18446744073709551615" || Number.parseInt(rawFeeString) > 1000000) {
		console.warn("BN appears to be uninitialized or invalid, using default fee");
		feePercent = 1; // Default to 1% fee
	} else {
		try {
			feePercent = mode === "sell" ? configAccount.platformSellFee.toNumber() : configAccount.platformBuyFee.toNumber();
		} catch (error) {
			feePercent = Number.parseInt(rawFeeString) / 100;
		}
	}

	const swapAmount = parseUnits(String(amount), mode === "buy" ? 9 : token.decimals);
	const adjustedAmountW = Math.floor((Number(swapAmount) * (FEE_BASIS_POINTS - feePercent)) / FEE_BASIS_POINTS);

	let estimatedOutput = 0;
	if (mode === "buy") {
		const feeBasisPoints = new BN(convertToBasisPoints(feePercent));
		console.log("feeBasisPoints", feeBasisPoints.toString());
		const amountBN = new BN(adjustedAmountW);
		const adjustedAmount = amountBN.mul(new BN(10000)).sub(feeBasisPoints).div(new BN(10000));
		const reserveTokenBN = new BN(reserveToken.toString());
		const numerator = reserveTokenBN.mul(adjustedAmount);
		const denominator = new BN(reserveLamport.toString()).add(adjustedAmount);

		estimatedOutput = numerator.div(denominator).toNumber();
	}
	if (mode === "sell") {
		const feeBasisPoints = convertToBasisPoints(feePercent);
		const amountBN = new BN(adjustedAmountW);
		const adjustedAmount = amountBN.mul(new BN(10000 - feeBasisPoints)).div(new BN(10000));
		const numerator = new BN(reserveLamport.toString()).mul(adjustedAmount);
		const denominator = new BN(reserveToken.toString()).add(adjustedAmount);
		if (denominator.isZero()) throw new Error("Division by zero");
		estimatedOutput = numerator.div(denominator).toNumber();
	}

	/** Factor in the slippage */
	const finalAmount = new BN(Math.floor((estimatedOutput * (10000 - Number(slippage))) / 10000)).toNumber();

	return {
		minimumReceived: finalAmount,
		swapAmount,
	};
};

export const retrieveQuote = async ({
	amount,
	token,
	mode,
	slippage,
	wallet,
	connection,
}: {
	amount: string | number;
	token: IToken;
	mode: "buy" | "sell";
	slippage: number;
	wallet?: WalletContextState;
	connection?: Connection;
}): Promise<{
	minimumReceived: number;
	swapUsdValue?: string;
	priceImpactPct?: string;
	quote?: unknown;
}> => {
	const provider = token?.imported || token?.curveCompleted ? "jupiter" : "waifufun";
	if (provider === "jupiter") {
		return await retrieveJupiterQuote({
			amount,
			token,
			mode,
			slippage,
		});
	}
	const HELIUS_RPC_URL =
		token?.chainId === SolanaNetworkIds.Devnet
			? `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
			: `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

	connection = new Connection(HELIUS_RPC_URL, "finalized");

	if (provider === "waifufun") {
		if (!wallet || !connection) throw new Error("No wallet or connection passed.");
		return await retrieveAutofunQuote({
			slippage,
			wallet,
			connection,
			amount,
			token,
			mode,
		});
	}

	throw new Error("No quote route found. Please contact waifu.fun");
};

export const getBondingCurvePDA = async (
	program: Program<CurrentAutofunTypes> | Program<LegacyAutofunTypes>,
	tokenAddress: AddressLike,
) => {
	const [bondingCurvePda] = PublicKey.findProgramAddressSync(
		[Buffer.from("bonding_curve"), new PublicKey(tokenAddress).toBytes()],
		program.programId,
	);
	if (!program.account.bondingCurve) {
		throw new Error("program.account.bondingCurve is undefined");
	}
	const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
	return curve;
};

type WalletLike = {
	publicKey: PublicKey;
	signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
	signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

function createSpoofedWallet(): WalletLike {
	const keypair = Keypair.generate();

	return {
		publicKey: keypair.publicKey,

		async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
			if (tx instanceof Transaction) {
				tx.partialSign(keypair);
			} else if (tx instanceof VersionedTransaction) {
				tx.sign([keypair]);
			}
			return tx;
		},

		async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
			return txs.map((tx) => {
				if (tx instanceof Transaction) {
					tx.partialSign(keypair);
				} else if (tx instanceof VersionedTransaction) {
					tx.sign([keypair]);
				}
				return tx;
			});
		},
	};
}

export const getAutofunProgram = async (connection: Connection, wallet: WalletContextState, version = 2) => {
	const walletToUse =
		!wallet?.publicKey || !wallet?.signTransaction || !wallet?.signAllTransactions ? createSpoofedWallet() : wallet;

	if (!walletToUse.publicKey || !walletToUse.signTransaction || !walletToUse.signAllTransactions) {
		throw new Error("Wallet not fully connected or compatible.");
	}
	const provider = new AnchorProvider(
		connection,
		{
			publicKey: walletToUse.publicKey,
			signTransaction: walletToUse.signTransaction,
			signAllTransactions: walletToUse.signAllTransactions,
		},
		AnchorProvider.defaultOptions(),
	);
	const program =
		version === 1
			? createLegacyAutofunProgramWithProvider(provider)
			: createCurrentAutofunProgramWithProvider(provider);

	const [configPda, _] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
	const configAccount = await program.account.config.fetch(configPda);

	return { program, configAccount };
};

export const executeSwap = async (
	from: AddressLike,
	token: IToken,
	inputAmount: string | number,
	mode: "buy" | "sell",
	slippage: number,
	speed: TSpeed,
	connection: Connection,
	wallet: WalletContextState,
	onTransactionStart?: (signature: string, expectedOutput: number) => void,
): Promise<string> => {
	if (!connection) throw new Error("No connection was found");

	const parsedInputAmount = parseUnits(String(inputAmount), mode === "buy" ? 9 : token.decimals);

	/** If the token was imported or has already migrated we can just use Jupiter */
	const HELIUS_RPC_URL =
		token?.chainId === SolanaNetworkIds.Devnet
			? `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
			: `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

	const heliusConnection = new Connection(HELIUS_RPC_URL, "finalized");
	if ((token?.imported || token?.curveCompleted) && token.chain === "solana") {
		const quoteResponse = await retrieveJupiterQuote({
			amount: inputAmount,
			mode,
			slippage,
			token,
		});

		const quote = quoteResponse?.quote;
		const expectedOutput = quoteResponse?.minimumReceived || 0;

		if (!quote) throw new Error("Failed to fetch quote from Jupiter");

		const options = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				userPublicKey: from,
				feeAccount: feeTokenAccount,
				quoteResponse: quote,
				prioritizationFeeLamports: {
					priorityLevelWithMaxLamports: {
						/** Retain a maximum of 0.1 SOL */
						maxLamports: 10000000,
						priorityLevel:
							speed === "normal" ? "medium" : speed === "turbo" ? "high" : speed === "ultra" ? "veryHigh" : "medium",
					},
				},
				dynamicComputeUnitLimit: true,
			}),
		};

		const res = await fetch("https://lite-api.jup.ag/swap/v1/swap", options);
		const json = await res.json();
		if (!res.ok && json?.error) {
			throw new Error(json?.error || "Something went wrong");
		}

		const simulationError = json?.simulationError?.error;

		if (simulationError) {
			throw new Error(simulationError);
		}

		const swapTransaction = json?.swapTransaction;

		if (!swapTransaction) throw new Error("Failed to fetch transaction");

		const swapTransactionBuf = Buffer.from(swapTransaction, "base64");

		const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

		const signature = await wallet.sendTransaction(transaction, heliusConnection);

		// Notify the transaction listener
		onTransactionStart?.(signature, expectedOutput);

		return signature;
	}

	/** If the token was not imported, the curve hasn't completed and it's Solana we use our program */
	if (!token?.imported && !token?.curveCompleted && token.chain === "solana") {
		const { program, configAccount } = await getAutofunProgram(heliusConnection, wallet, token.version);

		const quote = await retrieveAutofunQuote({
			amount: inputAmount,
			connection: heliusConnection,
			mode,
			slippage,
			token,
			wallet,
		});

		/** Deadline: 5 minutes */
		const deadline = Math.floor(Date.now() / 1000) + 120;

		const style = mode === "buy" ? 0 : 1;
		const ixs: TransactionInstruction[] = [];
		const swapIx = await program.methods
			.swap(new BN(String(quote.swapAmount)), style, new BN(quote.minimumReceived), new BN(deadline))
			.accounts({
				teamWallet: configAccount.teamWallet,
				user: from,
				tokenMint: new PublicKey(token.contractAddress),
			})
			.instruction();

		ixs.push(swapIx);

		/** Handle the priority fee */
		let solFee = 0.00005;
		switch (speed) {
			case "normal":
				solFee = 0.00005;
				break;
			case "turbo":
				solFee = 0.0005;
				break;
			case "ultra":
				solFee = 0.005;
				break;
		}
		const feeLamports = Math.floor(solFee * 1e9);

		ixs.push(
			ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: feeLamports,
			}),
		);

		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

		if (!wallet || !wallet?.publicKey) throw new Error("Wallet not connected properly");

		const messageV0 = new TransactionMessage({
			payerKey: wallet.publicKey,
			recentBlockhash: blockhash,
			instructions: ixs,
		}).compileToV0Message();

		const versionedTx = new VersionedTransaction(messageV0);

		const simulation = await connection.simulateTransaction(versionedTx, {
			sigVerify: false,
			replaceRecentBlockhash: true,
		});

		if (simulation?.value?.err) {
			console.error("Transaction simulation failed:", simulation.value.err);
			console.error("Simulation Logs:", simulation.value.logs);
			throw new Error(simulation?.value?.err.toString());
		}

		const signature = await wallet.sendTransaction(versionedTx, connection);

		onTransactionStart?.(signature, quote.minimumReceived);

		return signature;
	}

	throw new Error("No route found for token to swap against. Contact waifufun.");
};

export const calculateBondingCurveParams = (
	curveLimit: number,
): { virtualLamportReserves: number; initBondingCurve: number } => {
	// Default values in SOL
	const normalizedCurveLimit = curveLimit / LAMPORTS_PER_SOL;

	const defaultInitBondingCurve = 75;

	// Calculate virtual reserves as 25% of the curve limit (100 - 75 = 25%)
	const virtualReservesSOL = (normalizedCurveLimit * (100 - defaultInitBondingCurve)) / 100;

	// Devnet: round to 0.1 SOL, Mainnet: round to 1 SOL
	const roundingFactor = process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 10 : 1;
	const roundedVirtualReservesSOL = Math.round(virtualReservesSOL * roundingFactor) / roundingFactor;
	const virtualLamportReserves = Math.floor(roundedVirtualReservesSOL * LAMPORTS_PER_SOL);
	const initBondingCurve = defaultInitBondingCurve;

	return { virtualLamportReserves, initBondingCurve };
};

export const launchAndSwapTx = async (
	creator: PublicKey,
	decimals: number,
	tokenSupply: number,
	curveLimit: number,
	maxAmount: number,
	delayForTrade: number,
	limitTimeToUpdate: number,
	name: string,
	symbol: string,
	uri: string,
	swapAmount: number,
	slippageBps: number,
	connection: Connection,
	mintKeypair: Keypair,
	wallet: WalletContextState,
) => {
	const slippage = slippageBps ? slippageBps : 100;
	const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
	const { program, configAccount } = await getAutofunProgram(connection, wallet, 2);

	// Calculate minimum receive amount based on bonding curve formula
	const { virtualLamportReserves, initBondingCurve } = calculateBondingCurveParams(curveLimit);
	console.log("virtualLamportReserves:", virtualLamportReserves);
	console.log("initBondingCurve:", initBondingCurve);

	const initBondingCurveAmount = (tokenSupply * initBondingCurve) / 100;

	// Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
	// where x = reserveToken, y = reserveLamport, dx = swapAmount
	const numerator = virtualLamportReserves * swapAmount;
	const denominator = initBondingCurveAmount + swapAmount;
	const expectedOutput = Math.floor(numerator / denominator);

	// Apply slippage to expected output
	const minOutput = Math.floor((expectedOutput * (10000 - slippage)) / 10000);
	const allowCreatorTime = true;

	const tx = await (program as unknown as Program<CurrentAutofunTypes>).methods
		.launchAndSwap(
			decimals,
			new BN(tokenSupply),
			new BN(virtualLamportReserves),
			new BN(curveLimit),
			new BN(maxAmount),
			new BN(delayForTrade),
			new BN(limitTimeToUpdate),
			allowCreatorTime,
			name,
			symbol,
			uri,
			new BN(swapAmount),
			new BN(minOutput),
			new BN(deadline),
		)
		.accounts({
			teamWallet: configAccount.teamWallet,
			creator: creator,
			token: mintKeypair.publicKey,
		})
		.transaction();

	tx.feePayer = creator;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};
export const createTokenTx = async (
	tokenData: TokenMetadata,
	{ connection, wallet }: { connection: Connection; wallet: WalletContextState },
): Promise<CreateTokenResponse> => {
	console.log("SolanaWallet: Creating token with data:", tokenData);
	console.log("tokenSupply:", process.env.NEXT_PUBLIC_TOKEN_SUPPLY);
	console.log("decimals:", process.env.NEXT_PUBLIC_DECIMALS);

	const { program, configAccount } = await getAutofunProgram(connection, wallet, 2);
	if (!wallet?.publicKey) throw new Error("Wallet not correctly initialized");
	const address = wallet.publicKey.toBase58();

	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
		units: 300000,
	});

	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
		microLamports: 50000,
	});

	const curveLimit = tokenData.curveLimit ? Number(tokenData.curveLimit) * LAMPORTS_PER_SOL : Number(curveLimitConst);
	const decimals = Number(process.env.NEXT_PUBLIC_DECIMALS);
	const { virtualLamportReserves, initBondingCurve } = calculateBondingCurveParams(curveLimit);
	console.log("virtualLamportReserves:", virtualLamportReserves);

	// make sure max amount is in lamports with max 9 decimals
	const maxAmount = Math.floor(tokenData.tradeLimitSol * LAMPORTS_PER_SOL);

	const delayForTrade = tokenData.delayForTrade || 0;
	const limitTimeToUpdate = 360000; // 100 hours to update max buy/sell amounts	//
	const accounts = getLaunchAccounts({
		programId: program.programId,
		creator: wallet.publicKey,
		tokenMint: tokenData.mintKeyPair.publicKey,
		teamWallet: configAccount.teamWallet,
	});
	console.log({
		decimals: Number(process.env.NEXT_PUBLIC_DECIMALS),
		tokenSupply: Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY),
		virtualLamportReserves: new BN(virtualLamportReserves).toNumber(),
		curveLimit: new BN(curveLimit).toNumber(),
		initBondingCurve: initBondingCurve,
		name: tokenData.name,
		symbol: tokenData.symbol,
		metadataUrl: tokenData.metadataUrl,
		maxAmount: new BN(maxAmount).toNumber(),
		delayForTrade: new BN(delayForTrade).toNumber(),
		limitTimeToUpdate: new BN(limitTimeToUpdate).toNumber(),
		accounts: accounts,
	});
	const allowCreatorTime = true;

	const tx =
		tokenData.buyAmount > 0
			? await launchAndSwapTx(
					new PublicKey(address),
					Number(process.env.NEXT_PUBLIC_DECIMALS),
					Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY),
					curveLimit,
					maxAmount,
					delayForTrade,
					limitTimeToUpdate,
					tokenData.name,
					tokenData.symbol,
					tokenData.metadataUrl,
					Math.floor(tokenData.buyAmount * LAMPORTS_PER_SOL),
					100,
					connection,
					tokenData.mintKeyPair,
					wallet,
				)
			: await (program as unknown as Program<CurrentAutofunTypes>).methods
					.launch(
						Number(process.env.NEXT_PUBLIC_DECIMALS),
						new BN(Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY)),
						new BN(virtualLamportReserves),
						new BN(curveLimit),
						new BN(maxAmount),
						new BN(delayForTrade),
						new BN(limitTimeToUpdate),
						allowCreatorTime,
						tokenData.name,
						tokenData.symbol,
						tokenData.metadataUrl,
					)
					.accounts({
						creator: new PublicKey(address),
						token: tokenData.mintKeyPair.publicKey,
						teamWallet: configAccount.teamWallet,
					})
					.transaction();

	tx.instructions = [modifyComputeUnits, addPriorityFee, ...tx.instructions];

	tx.feePayer = new PublicKey(address);
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
	tx.recentBlockhash = blockhash;

	tx.sign(tokenData.mintKeyPair);

	const simulation = await connection.simulateTransaction(tx);
	if (simulation?.value?.err) {
		console.error("Transaction simulation failed:", simulation.value.err);
		console.error("Simulation Logs:", simulation.value.logs);
		throw new Error(simulation?.value?.err.toString());
	}

	if (!wallet || !wallet?.signTransaction) throw new Error("Wallet not properly initialized");
	const signedTx = await wallet.signTransaction(tx);
	const txId = await connection.sendRawTransaction(signedTx.serialize(), {
		preflightCommitment: "confirmed",
		maxRetries: 5,
	});

	await connection.confirmTransaction(
		{
			signature: txId,
			blockhash,
			lastValidBlockHeight,
		},
		"confirmed",
	);

	return {
		mintPublicKey: tokenData.mintKeyPair.publicKey,
		userPublicKey: new PublicKey(address),
		signature: txId,
	};
};

export const resizeImage = (url: string, width: number, height: number) => {
	if (!url) return "/logo.png";
	if (url.includes("ipfs") || !url.startsWith("http")) {
		return url;
	}
	return `https://waifu.fun/cdn-cgi/image/width=${width},height=${height},format=png/${url}`;
};
