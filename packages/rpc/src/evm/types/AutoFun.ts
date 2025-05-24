import type { Address, Abi, Hash, Chain } from "viem";

export type AutoFunConfig = {
	name: string;
	symbol: string;
	initialSupply: bigint;
	maxSupply: bigint;
	owner: Address;
};

export type BondingCurveConfig = {
	token: Address;
	amountIn: bigint;
	minAmountOut: bigint;
};

export type AutoFunContract = {
	address: Address;
	abi: readonly Abi[];
	chain: Chain;
	getLaunchedTokensByOwner: (owner: Address) => Promise<readonly Address[]>;
	getAllLaunchedTokens: () => Promise<readonly Address[]>;
	initialize: (factory: Address, globalConfig: Address) => Promise<Hash>;
	updateFactory: (newFactory: Address) => Promise<Hash>;
	updateGlobalConfig: (newConfig: Address) => Promise<Hash>;
	launch: (config: AutoFunConfig) => Promise<Hash>;
	swap: (config: BondingCurveConfig) => Promise<Hash>;
	launchAndSwap: (launchConfig: AutoFunConfig, swapConfig: BondingCurveConfig) => Promise<Hash>;
	withdraw: (token: Address, amount: bigint) => Promise<Hash>;
};

export type TokenLaunchedEvent = {
	token: Address;
	owner: Address;
	name: string;
	symbol: string;
	initialSupply: bigint;
	maxSupply: bigint;
};

export type BondingCurveCompletedEvent = {
	token: Address;
	amountIn: bigint;
	amountOut: bigint;
};

export type SwapExecutedEvent = {
	token: Address;
	amountIn: bigint;
	amountOut: bigint;
};

export type WithdrawnEvent = {
	token: Address;
	amount: bigint;
	recipient: Address;
};

export type AutoFunContractFactory = {
	deploy: (args: { factory: Address; globalConfig: Address }) => Promise<AutoFunContract>;
	attach: (address: Address) => AutoFunContract;
};
