import type { Abi, Address, Chain, Hash } from "viem";

export type WaifuFunConfigParams = {
	teamWallet: Address;
	buyFee: bigint;
	sellFee: bigint;
	curveLimit: bigint;
	initBondingCurveRate: bigint;
	minETHAmount: bigint;
	maxETHAmount: bigint;
	minTotalSupply: bigint;
	maxTotalSupply: bigint;
	minDecimal: number;
	maxDecimal: number;
};

export type WaifuFunLaunchParams = {
	totalSupply: bigint;
	virtualReserveETHAmount: bigint;
	decimals: number;
	name: string;
	symbol: string;
};

export type WaifuFunSwapParameter = {
	token: Address;
	amountIn: bigint;
	minAmountOut: bigint;
	direction: 0 | 1;
	deadline: bigint;
};

export type WaifuFunBondingCurve = {
	token: Address;
	creator: Address;
	initReserveETHAmount: bigint;
	reserveTokenAmount: bigint;
	reserveETHAmount: bigint;
	curveLimit: bigint;
	isCompleted: boolean;
};

export type WaifuFunContract = {
	address: Address;
	abi: readonly Abi[];
	chain: Chain;
	BONDING_CURVE_FIXED_POINT: () => Promise<bigint>;
	FEE_FIXED_POINT: () => Promise<bigint>;
	factory: () => Promise<Address>;
	globalConfig: () => Promise<WaifuFunConfigParams>;
	bondingCurvesByToken: (token: Address) => Promise<WaifuFunBondingCurve>;
	getLaunchedTokensByOwner: (owner: Address) => Promise<readonly Address[]>;
	getAllLaunchedTokens: () => Promise<readonly Address[]>;
	initialize: (params: WaifuFunConfigParams) => Promise<Hash>;
	updateFactory: (newFactory: Address) => Promise<Hash>;
	updateGlobalConfig: (newConfig: WaifuFunConfigParams) => Promise<Hash>;
	launch: (params: WaifuFunLaunchParams) => Promise<Hash>;
	swap: (params: WaifuFunSwapParameter, value?: bigint) => Promise<Hash>;
	launchAndSwap: (
		launchParams: WaifuFunLaunchParams,
		swapParams: WaifuFunSwapParameter,
		value?: bigint,
	) => Promise<Hash>;
	withdraw: (token: Address) => Promise<Hash>;
	owner: () => Promise<Address>;
	pendingOwner: () => Promise<Address>;
	transferOwnership: (newOwner: Address) => Promise<Hash>;
	renounceOwnership: () => Promise<Hash>;
};

export type WaifuFunTokenFactoryUpdatedEvent = {
	factory: Address;
};

export type BondingCurveCompletedEvent = {
	token: Address;
	lastTrader: Address;
};

export type TokenLaunchedEvent = {
	totalSupply: bigint;
	virtualReserveETHAmount: bigint;
	decimals: number;
	name: string;
	symbol: string;
};

export type SwapExecutedEvent = {
	trader: Address;
	token: Address;
	amountIn: bigint;
	minAmountOut: bigint;
	direction: 0 | 1;
};

export type WithdrawnEvent = {
	token: Address;
	ethAmount: bigint;
	tokenAmount: bigint;
};

export type WaifuFunContractFactory = {
	deploy: (config: WaifuFunConfigParams) => Promise<WaifuFunContract>;
	attach: (address: Address) => WaifuFunContract;
};
