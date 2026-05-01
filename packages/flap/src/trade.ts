import {
	type Address,
	type Hash,
	type Hex,
	type PublicClient,
	type WalletClient,
	decodeFunctionResult,
	encodeFunctionData,
	zeroAddress,
} from "viem";

import { portalAbi } from "./abi/portal.js";
import { getPortalContractConfig } from "./client.js";
import { FLAP_DEFAULT_QUOTE_TOKEN } from "./constants.js";
import type { FlapQuoteExactInputParams, FlapSwapExactInputParams } from "./types.js";

const callPortal = async (
	publicClient: PublicClient,
	input: {
		functionName: "quoteExactInput";
		args: readonly [FlapQuoteExactInputParams];
		chainId?: number;
		network?: string;
		portalAddress?: Address;
		account?: Address;
		value?: bigint;
	},
) => {
	const contract = getPortalContractConfig({
		chainId: input.chainId as 56 | 97 | undefined,
		network: input.network as "bsc" | "bscTestnet" | undefined,
		address: input.portalAddress,
	});
	const data = encodeFunctionData({
		abi: portalAbi,
		functionName: input.functionName,
		args: input.args,
	});
	const response = await publicClient.call({
		to: contract.address,
		data,
		account: input.account,
		value: input.value,
	});

	if (!response.data) {
		throw new Error(`${input.functionName} returned no data`);
	}

	return decodeFunctionResult({
		abi: portalAbi,
		functionName: input.functionName,
		data: response.data,
	});
};

export const buildQuoteExactInputParams = (input: FlapQuoteExactInputParams): FlapQuoteExactInputParams => ({
	inputToken: input.inputToken,
	outputToken: input.outputToken,
	inputAmount: input.inputAmount,
});

export const quoteExactInput = async (
	publicClient: PublicClient,
	input: {
		params: FlapQuoteExactInputParams;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
		account?: Address;
		value?: bigint;
	},
): Promise<bigint> =>
	callPortal(publicClient, {
		functionName: "quoteExactInput",
		args: [input.params],
		chainId: input.chainId,
		network: input.network,
		portalAddress: input.portalAddress,
		account: input.account,
		value: input.value,
	}) as Promise<bigint>;

export const quoteBuyExactInput = async (
	publicClient: PublicClient,
	input: {
		token: Address;
		inputAmount: bigint;
		quoteToken?: Address;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
		account?: Address;
		value?: bigint;
	},
) =>
	quoteExactInput(publicClient, {
		params: {
			inputToken: input.quoteToken ?? FLAP_DEFAULT_QUOTE_TOKEN,
			outputToken: input.token,
			inputAmount: input.inputAmount,
		},
		chainId: input.chainId,
		network: input.network,
		portalAddress: input.portalAddress,
		account: input.account,
		value: input.value,
	});

export const quoteSellExactInput = async (
	publicClient: PublicClient,
	input: {
		token: Address;
		inputAmount: bigint;
		quoteToken?: Address;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
		account?: Address;
	},
) =>
	quoteExactInput(publicClient, {
		params: {
			inputToken: input.token,
			outputToken: input.quoteToken ?? FLAP_DEFAULT_QUOTE_TOKEN,
			inputAmount: input.inputAmount,
		},
		chainId: input.chainId,
		network: input.network,
		portalAddress: input.portalAddress,
		account: input.account,
	});

export const buildSwapExactInputWrite = (input: {
	params: FlapSwapExactInputParams;
	chainId?: number;
	network?: string;
	portalAddress?: Address;
	value?: bigint;
}) => {
	const contract = getPortalContractConfig({
		chainId: input.chainId as 56 | 97 | undefined,
		network: input.network as "bsc" | "bscTestnet" | undefined,
		address: input.portalAddress,
	});

	return {
		...contract,
		functionName: "swapExactInput",
		args: [input.params],
		value: input.value ?? 0n,
	} as const;
};

export const swapExactInput = async (
	walletClient: WalletClient,
	input: {
		account: Address;
		params: FlapSwapExactInputParams;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
		value?: bigint;
	},
): Promise<Hash> =>
	walletClient.writeContract({
		account: input.account,
		...buildSwapExactInputWrite(input),
	});

export const buyToken = async (
	walletClient: WalletClient,
	input: {
		account: Address;
		token: Address;
		inputAmount: bigint;
		minOutputAmount: bigint;
		quoteToken?: Address;
		permitData?: Hex;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
	},
) => {
	const quoteToken = input.quoteToken ?? zeroAddress;

	return swapExactInput(walletClient, {
		account: input.account,
		params: {
			inputToken: quoteToken,
			outputToken: input.token,
			inputAmount: input.inputAmount,
			minOutputAmount: input.minOutputAmount,
			permitData: input.permitData ?? "0x",
		},
		chainId: input.chainId,
		network: input.network,
		portalAddress: input.portalAddress,
		value: quoteToken === zeroAddress ? input.inputAmount : 0n,
	});
};

export const sellToken = async (
	walletClient: WalletClient,
	input: {
		account: Address;
		token: Address;
		inputAmount: bigint;
		minOutputAmount: bigint;
		quoteToken?: Address;
		permitData?: Hex;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
	},
) =>
	swapExactInput(walletClient, {
		account: input.account,
		params: {
			inputToken: input.token,
			outputToken: input.quoteToken ?? zeroAddress,
			inputAmount: input.inputAmount,
			minOutputAmount: input.minOutputAmount,
			permitData: input.permitData ?? "0x",
		},
		chainId: input.chainId,
		network: input.network,
		portalAddress: input.portalAddress,
	});
