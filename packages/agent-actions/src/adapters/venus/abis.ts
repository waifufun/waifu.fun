import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";

import { venusContracts } from "./spec.js";

export interface VenusTxRequest {
	to: Address;
	data: Hex;
	value: bigint;
}

export const vBnbAbi = [
	{
		type: "function",
		name: "mint",
		stateMutability: "payable",
		inputs: [],
		outputs: [],
	},
] as const;

export const vTokenAbi = [
	{
		type: "function",
		name: "mint",
		stateMutability: "nonpayable",
		inputs: [{ name: "mintAmount", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "redeemUnderlying",
		stateMutability: "nonpayable",
		inputs: [{ name: "redeemAmount", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "borrow",
		stateMutability: "nonpayable",
		inputs: [{ name: "borrowAmount", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "repayBorrow",
		stateMutability: "nonpayable",
		inputs: [{ name: "repayAmount", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

export const venusComptrollerAbi = [
	{
		type: "function",
		name: "enterMarkets",
		stateMutability: "nonpayable",
		inputs: [{ name: "vTokens", type: "address[]" }],
		outputs: [{ name: "", type: "uint256[]" }],
	},
	{
		type: "function",
		name: "getAccountLiquidity",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [
			{ name: "error", type: "uint256" },
			{ name: "liquidity", type: "uint256" },
			{ name: "shortfall", type: "uint256" },
		],
	},
] as const;

export const isVenusNativeMarket = (vToken: Address): boolean =>
	vToken.toLowerCase() === venusContracts.vBNB.toLowerCase();

export const encodeSupply = (vToken: Address, amount: bigint): VenusTxRequest => {
	if (isVenusNativeMarket(vToken)) {
		return {
			to: vToken,
			data: encodeFunctionData({ abi: vBnbAbi, functionName: "mint" }),
			value: amount,
		};
	}

	return {
		to: vToken,
		data: encodeFunctionData({ abi: vTokenAbi, functionName: "mint", args: [amount] }),
		value: 0n,
	};
};

export const encodeRedeemUnderlying = (vToken: Address, amountUnderlying: bigint): VenusTxRequest => ({
	to: vToken,
	data: encodeFunctionData({
		abi: vTokenAbi,
		functionName: "redeemUnderlying",
		args: [amountUnderlying],
	}),
	value: 0n,
});

export const encodeBorrow = (vToken: Address, amount: bigint): VenusTxRequest => ({
	to: vToken,
	data: encodeFunctionData({ abi: vTokenAbi, functionName: "borrow", args: [amount] }),
	value: 0n,
});

export const encodeRepayBorrow = (vToken: Address, amount: bigint): VenusTxRequest => ({
	to: vToken,
	data: encodeFunctionData({ abi: vTokenAbi, functionName: "repayBorrow", args: [amount] }),
	value: 0n,
});

export const encodeEnterMarkets = (vTokens: Address[]): VenusTxRequest => ({
	to: venusContracts.comptroller,
	data: encodeFunctionData({
		abi: venusComptrollerAbi,
		functionName: "enterMarkets",
		args: [vTokens],
	}),
	value: 0n,
});
