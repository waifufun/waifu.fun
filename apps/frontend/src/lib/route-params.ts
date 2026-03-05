import type { ITokenLookUp } from "@waifufun/types";
import { EvmChainIds, SolanaNetworkIds } from "@waifufun/types";

export function parseTokenParams(params: {
	chain: string;
	chainId: string;
	contractAddress: string;
}): ITokenLookUp {
	const chainId = parseInt(params.chainId, 10);
	
	if (params.chain === "solana") {
		return {
			chain: "solana",
			chainId: chainId as SolanaNetworkIds,
			contractAddress: params.contractAddress,
		};
	}
	
	// Default to evm
	return {
		chain: "evm",
		chainId: chainId as EvmChainIds,
		contractAddress: params.contractAddress,
	};
}
