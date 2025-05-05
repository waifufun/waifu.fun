import { EvmChainIds, type EvmAddressLike } from "@autofun/types";
import { getAddress, type Chain } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";

export const UNISWAP_V4_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0x66a9893cc07d91d95644aedd05d03f95e1dba8af"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b"),
	[EvmChainIds.BaseMainnet]: getAddress("0x6ff5693b99212da76ad316178a184ab56d299b43"),
	[EvmChainIds.BaseSepolia]: getAddress("0x492e6456d9528771018deb9e87ef7750ef184104"),
};

export const WETH_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
	[EvmChainIds.BaseMainnet]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.BaseSepolia]: getAddress("0x4200000000000000000000000000000000000006"),
};

export const CHAINID_TO_VIEM_CHAIN: Record<EvmChainIds, Chain> = {
	[EvmChainIds.EthereumMainnet]: mainnet,
	[EvmChainIds.EthereumSepolia]: sepolia,
	[EvmChainIds.BaseMainnet]: base,
	[EvmChainIds.BaseSepolia]: baseSepolia,
};
