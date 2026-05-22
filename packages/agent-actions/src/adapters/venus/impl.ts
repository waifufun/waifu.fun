import type { Address } from "viem";

import { registerAdapter } from "../../registry.js";
import type { AdapterImpl } from "../../types.js";
import {
	encodeBorrow,
	encodeEnterMarkets,
	encodeErc20Approve,
	encodeRedeemUnderlying,
	encodeRepayBorrow,
	encodeSupply,
	isVenusNativeMarket,
	vTokenAbi,
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

type GetAccountLiquidityRead = {
	address: Address;
	abi: typeof venusComptrollerAbi;
	functionName: "getAccountLiquidity";
	args: [Address];
};

type UnderlyingRead = {
	address: Address;
	abi: typeof vTokenAbi;
	functionName: "underlying";
	args?: readonly [];
};

export interface VenusPublicClient {
	readContract: ((parameters: GetAccountLiquidityRead) => Promise<readonly [bigint, bigint, bigint]>) &
		((parameters: UnderlyingRead) => Promise<Address>);
}

export const venusAdapter: AdapterImpl<typeof venusSpec> = {
	spec: venusSpec,
	calls: {
		supply: async (ctx, input: unknown): Promise<VenusHashOutput> => {
			const supply = input as VenusSupplyInput;

			if (!isVenusNativeMarket(supply.vToken)) {
				const publicClient = ctx.publicClient as VenusPublicClient | undefined;
				if (!publicClient?.readContract) {
					throw new TypeError("Venus supply on non-native vTokens requires ctx.publicClient.readContract");
				}
				const underlying = await publicClient.readContract({
					address: supply.vToken,
					abi: vTokenAbi,
					functionName: "underlying",
				});
				// Assumes standard BEP20 approve semantics. The four whitelisted underlyings
				// (BUSD/USDT/USDC/ETH on BSC) qualify. Revisit if a future vToken backs an
				// underlying with non-standard approve (e.g. Ethereum-USDT approve-from-nonzero).
				await ctx.signAndSend(encodeErc20Approve(underlying, supply.vToken, supply.amount));
			}

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
