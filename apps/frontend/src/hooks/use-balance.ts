"use client";

import { DEFAULT_EVM_CHAIN_ID } from "@/providers/evm-provider";
import type { AddressLike, TChain } from "@waifufun/types";
import { type Address, formatEther } from "viem";
import { useBalance as useWagmiBalance } from "wagmi";

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
