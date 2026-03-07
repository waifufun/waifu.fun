import type { Abi, Address, Chain, Hash } from "viem";

export type WaifuFunTokenFactoryDeployTokenParams = {
	name: string;
	symbol: string;
	totalSupply: bigint;
	decimal: number;
};

export type WaifuFunTokenFactoryContract = {
	address: Address;
	abi: readonly Abi[];
	chain: Chain;
	initialize: () => Promise<Hash>;
	deployToken: (params: WaifuFunTokenFactoryDeployTokenParams) => Promise<Hash>;
	owner: () => Promise<Address>;
	transferOwnership: (newOwner: Address) => Promise<Hash>;
	renounceOwnership: () => Promise<Hash>;
};

export type InitializedEvent = {
	version: number;
};

export type OwnershipTransferredEvent = {
	previousOwner: Address;
	newOwner: Address;
};

export type WaifuFunTokenFactoryContractFactory = {
	deploy: () => Promise<WaifuFunTokenFactoryContract>;
	attach: (address: Address) => WaifuFunTokenFactoryContract;
};
