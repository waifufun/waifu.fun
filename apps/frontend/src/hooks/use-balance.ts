"use client";

import type { AddressLike, TChain } from "@waifufun/types";
import { useBalance as useWagmiBalance } from "wagmi";
import { formatEther, type Address } from "viem";
import { DEFAULT_EVM_CHAIN_ID } from "@/providers/evm-provider";

export default function useBalance({ chain, address }: { chain: TChain; address: AddressLike | undefined }) {
	const isEvmBalanceQuery = chain === "evm" && !!address;

	const query = useWagmiBalance({
		address: address as Address | undefined,
		chainId: DEFAULT_EVM_CHAIN_ID,
		query: {
			enabled: isEvmBalanceQuery,
			refetchInterval: 60_000,
			select: (data) => Number(formatEther(data.value)),
		},
	});

	return query;
}
