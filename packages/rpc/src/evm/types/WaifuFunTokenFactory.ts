import type { Address, Abi, Hash, Chain } from "viem";

export type TokenConfig = {
	name: string;
	symbol: string;
	initialSupply: bigint;
	maxSupply: bigint;
	owner: Address;
};

export type WaifuFunTokenFactoryContract = {
	address: Address;
	abi: readonly Abi[];
	chain: Chain;
	getTokenCount: () => Promise<bigint>;
	getTokenByIndex: (index: bigint) => Promise<Address>;
	getTokensByOwner: (owner: Address) => Promise<readonly Address[]>;
	createToken: (config: TokenConfig) => Promise<Hash>;
	updateTokenConfig: (token: Address, newConfig: TokenConfig) => Promise<Hash>;
	transferTokenOwnership: (token: Address, newOwner: Address) => Promise<Hash>;
};

export type TokenCreatedEvent = {
	token: Address;
	owner: Address;
	name: string;
	symbol: string;
	initialSupply: bigint;
	maxSupply: bigint;
};

export type TokenConfigUpdatedEvent = {
	token: Address;
	owner: Address;
	name: string;
	symbol: string;
	initialSupply: bigint;
	maxSupply: bigint;
};

export type TokenOwnershipTransferredEvent = {
	token: Address;
	previousOwner: Address;
	newOwner: Address;
};

export type WaifuFunTokenFactoryContractFactory = {
	deploy: () => Promise<WaifuFunTokenFactoryContract>;
	attach: (address: Address) => WaifuFunTokenFactoryContract;
};
