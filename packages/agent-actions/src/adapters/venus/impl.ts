import type { Address } from "viem";

import { registerAdapter } from "../../registry.js";
import type { AdapterImpl } from "../../types.js";
import {
	encodeBorrow,
	encodeEnterMarkets,
	encodeRedeemUnderlying,
	encodeRepayBorrow,
	encodeSupply,
	venusComptrollerAbi,
} from "./abis.js";
import {
	type VenusAccountLiquidityInput,
	type VenusAccountLiquidityOutput,
	type VenusBorrowInput,
	type VenusEnterMarketsInput,
	type VenusHashOutput,
	type VenusRedeemInput,
	type VenusRepayInput,
	type VenusSupplyInput,
	venusContracts,
	venusSpec,
} from "./spec.js";

export interface VenusPublicClient {
	readContract: (parameters: {
		address: Address;
		abi: typeof venusComptrollerAbi;
		functionName: "getAccountLiquidity";
		args: [Address];
	}) => Promise<readonly [bigint, bigint, bigint]>;
}

export const venusAdapter: AdapterImpl<typeof venusSpec> = {
	spec: venusSpec,
	calls: {
		supply: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const supply = input as VenusSupplyInput;
			// TODO: wrap ERC20 approval flow before calling mint(amount) for non-native vTokens.
			const { hash } = await ctx.signAndSend(encodeSupply(supply.vToken, supply.amount));

			return { hash };
		},
		redeem: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const redeem = input as VenusRedeemInput;
			const { hash } = await ctx.signAndSend(encodeRedeemUnderlying(redeem.vToken, redeem.amountUnderlying));

			return { hash };
		},
		borrow: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const borrow = input as VenusBorrowInput;
			const { hash } = await ctx.signAndSend(encodeBorrow(borrow.vToken, borrow.amount));

			return { hash };
		},
		repay: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const repay = input as VenusRepayInput;
			const { hash } = await ctx.signAndSend(encodeRepayBorrow(repay.vToken, repay.amount));

			return { hash };
		},
		enterMarkets: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const enterMarkets = input as VenusEnterMarketsInput;
			const { hash } = await ctx.signAndSend(encodeEnterMarkets(enterMarkets.vTokens));

			return { hash };
		},
		accountLiquidity: async (ctx, input: unknown): Promise<VenusAccountLiquidityOutput> => {
			const accountLiquidity = input as VenusAccountLiquidityInput;
			const publicClient = ctx.publicClient as VenusPublicClient;
			const [error, liquidity, shortfall] = await publicClient.readContract({
				address: venusContracts.comptroller,
				abi: venusComptrollerAbi,
				functionName: "getAccountLiquidity",
				args: [accountLiquidity.account],
			});

			if (error !== 0n) {
				throw new Error(`Venus getAccountLiquidity failed with error code ${error.toString()}`);
			}

			return { liquidity, shortfall };
		},
	},
};

registerAdapter(venusAdapter);
