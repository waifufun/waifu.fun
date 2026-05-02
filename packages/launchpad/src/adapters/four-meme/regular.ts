import {
	FOURMEME_ADDRESSES_BSC_MAINNET,
	FOURMEME_BSC_MAINNET_CHAIN_ID,
	type FourMemeClient,
	TokenManager2Abi,
	getPancakePair,
	getTokenInfo,
	getTokenInfoEx,
} from "@waifufun/fourmeme";
import { type Address, type Hex, encodeFunctionData, getAddress, isAddress, parseEventLogs } from "viem";

import type {
	CreateTokenParams,
	FourMemeRegularFeeConfig,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
	UnsignedTx,
} from "../../types.js";

interface FourMemeSignedCreatePayload {
	createArg: Hex;
	signature: Hex;
	value?: bigint;
}

const getSignedPayload = (params: CreateTokenParams): FourMemeSignedCreatePayload => {
	const payload = (params as CreateTokenParams & { fourMemeSignedPayload?: FourMemeSignedCreatePayload })
		.fourMemeSignedPayload;
	if (!payload) {
		throw new Error("four.meme create requires a signed create payload from Four.Meme API");
	}
	return payload;
};

const tokenAddressFromLogArgs = (args: Record<string, unknown>): string | undefined => {
	for (const key of ["token", "base", "tokenAddress"]) {
		const value = args[key];
		if (typeof value === "string" && isAddress(value)) return getAddress(value);
	}
	return undefined;
};

export const fourMemeRegularDescriptor: LaunchpadDescriptor = {
	id: "four-meme-regular",
	status: "live",
	chain: "bsc",
	displayName: "four.meme Regular",
	shortDescription: "Standard four.meme bonding-curve launch on BSC.",
	feeSummary: "Fixed four.meme trading fees; no creator tax split.",
	graduationTarget: "Four.meme graduation to PancakeSwap liquidity.",
	badges: ["recommended"],
};

export const createFourMemeRegularAdapter = (client?: FourMemeClient): LaunchpadAdapter => ({
	descriptor: fourMemeRegularDescriptor,

	getDefaultFeeConfig(): FourMemeRegularFeeConfig {
		return { kind: "four-meme-regular" };
	},

	validateFeeConfig(c: LaunchpadFeeConfig): { ok: boolean; errors: string[] } {
		const errors: string[] = [];
		if (c.kind !== "four-meme-regular") errors.push("feeConfig.kind must be four-meme-regular");
		return { ok: errors.length === 0, errors };
	},

	async buildCreateTokenTx(params: CreateTokenParams): Promise<UnsignedTx> {
		const validation = this.validateFeeConfig(params.feeConfig, "prod");
		if (!validation.ok) throw new Error(validation.errors.join("; "));
		const payload = getSignedPayload(params);
		return {
			to: FOURMEME_ADDRESSES_BSC_MAINNET.tokenManager2,
			data: encodeFunctionData({
				abi: TokenManager2Abi,
				functionName: "createToken",
				args: [payload.createArg, payload.signature],
			}),
			value: payload.value ?? params.initialBuyWei ?? 0n,
			chainId: FOURMEME_BSC_MAINNET_CHAIN_ID,
		};
	},

	parseCreateTokenReceipt(receipt: any): { tokenAddress: string; curveAddress: string } {
		const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
		const parsed = parseEventLogs({ abi: TokenManager2Abi, logs, strict: false });
		for (const event of parsed) {
			if (event.eventName === "TokenCreate" && event.args) {
				const tokenAddress = tokenAddressFromLogArgs(event.args as Record<string, unknown>);
				if (tokenAddress) return { tokenAddress, curveAddress: tokenAddress };
			}
		}
		throw new Error("TokenCreate event not found in four.meme receipt");
	},

	async getCurveProgress(tokenAddress: string): Promise<{ raisedWei: bigint; targetWei: bigint }> {
		if (!client) throw new Error("FourMemeClient required for curve progress reads");
		const info = await getTokenInfo(client, getAddress(tokenAddress) as Address);
		return { raisedWei: info.funds, targetWei: info.maxFunds };
	},

	async getGraduationStatus(tokenAddress: string): Promise<{ graduated: boolean; lpAddress?: string }> {
		if (!client) throw new Error("FourMemeClient required for graduation reads");
		const token = getAddress(tokenAddress) as Address;
		const info = await getTokenInfo(client, token);
		const lpAddress = await getPancakePair(client, token);
		return info.liquidityAdded && lpAddress !== "0x0000000000000000000000000000000000000000"
			? { graduated: true, lpAddress }
			: { graduated: false };
	},

	async getTradeFeeBps(tokenAddress: string): Promise<number> {
		if (!client) throw new Error("FourMemeClient required for fee reads");
		const info = await getTokenInfo(client, getAddress(tokenAddress) as Address);
		return Number(info.tradingFeeRate);
	},

	async getTreasuryAddress(tokenAddress: string): Promise<string | null> {
		if (!client) throw new Error("FourMemeClient required for treasury reads");
		const info = await getTokenInfoEx(client, getAddress(tokenAddress) as Address);
		return info.founder;
	},
});

export const fourMemeRegularAdapter = createFourMemeRegularAdapter();
