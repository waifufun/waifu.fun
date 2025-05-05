import { EvmChainIds, type EvmAddressLike } from "@autofun/types";
import { getAddress } from "viem";

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

export const MULTICALL_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696"),
	[EvmChainIds.EthereumSepolia]: getAddress("0xD7F33bCdb21b359c8ee6F0251d30E94832baAd07"),
	[EvmChainIds.BaseMainnet]: getAddress("0x091e99cb1C49331a94dD62755D168E941AbD0693"),
	[EvmChainIds.BaseSepolia]: getAddress("0xd867e273eAbD6c853fCd0Ca0bFB6a3aE6491d2C1"),
};
