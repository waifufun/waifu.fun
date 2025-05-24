import { type Address, type Abi, type Hash, type Chain } from 'viem';

export type AutoFunTokenContract = {
  address: Address;
  abi: readonly Abi[];
  chain: Chain;
  name: () => Promise<string>;
  symbol: () => Promise<string>;
  decimals: () => Promise<number>;
  totalSupply: () => Promise<bigint>;
  maxSupply: () => Promise<bigint>;
  balanceOf: (account: Address) => Promise<bigint>;
  allowance: (owner: Address, spender: Address) => Promise<bigint>;
  owner: () => Promise<Address>;
  transfer: (to: Address, amount: bigint) => Promise<Hash>;
  transferFrom: (from: Address, to: Address, amount: bigint) => Promise<Hash>;
  approve: (spender: Address, amount: bigint) => Promise<Hash>;
  increaseAllowance: (spender: Address, addedValue: bigint) => Promise<Hash>;
  decreaseAllowance: (spender: Address, subtractedValue: bigint) => Promise<Hash>;
  mint: (to: Address, amount: bigint) => Promise<Hash>;
  burn: (amount: bigint) => Promise<Hash>;
  burnFrom: (account: Address, amount: bigint) => Promise<Hash>;
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

export type AutoFunTokenContractFactory = {
  deploy: (args: {
    name: string;
    symbol: string;
    initialSupply: bigint;
    maxSupply: bigint;
    owner: Address;
  }) => Promise<AutoFunTokenContract>;
  attach: (address: Address) => AutoFunTokenContract;
}; 