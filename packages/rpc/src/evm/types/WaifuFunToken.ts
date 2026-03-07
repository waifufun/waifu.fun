import type { Abi, Address, Chain, Hash } from "viem";

export type WaifuFunTokenDeployParams = {
	name: string;
	symbol: string;
	totalSupply: bigint;
	decimal: number;
};

export type WaifuFunTokenContract = {
	address: Address;
	abi: readonly Abi[];
	chain: Chain;
	name: () => Promise<string>;
	symbol: () => Promise<string>;
	decimals: () => Promise<number>;
	totalSupply: () => Promise<bigint>;
	balanceOf: (account: Address) => Promise<bigint>;
	allowance: (owner: Address, spender: Address) => Promise<bigint>;
	owner: () => Promise<Address>;
	approve: (spender: Address, amount: bigint) => Promise<Hash>;
	decreaseAllowance: (spender: Address, subtractedValue: bigint) => Promise<Hash>;
	increaseAllowance: (spender: Address, addedValue: bigint) => Promise<Hash>;
	mintToken: (recipient: Address, amount: bigint) => Promise<Hash>;
	transfer: (to: Address, amount: bigint) => Promise<Hash>;
	transferFrom: (from: Address, to: Address, amount: bigint) => Promise<Hash>;
	transferOwnership: (newOwner: Address) => Promise<Hash>;
	renounceOwnership: () => Promise<Hash>;
};

export type TransferEvent = {
	from: Address;
	to: Address;
	value: bigint;
};

export type ApprovalEvent = {
	owner: Address;
	spender: Address;
	value: bigint;
};

export type OwnershipTransferredEvent = {
	previousOwner: Address;
	newOwner: Address;
};

export type WaifuFunTokenContractFactory = {
	deploy: (args: WaifuFunTokenDeployParams) => Promise<WaifuFunTokenContract>;
	attach: (address: Address) => WaifuFunTokenContract;
};
