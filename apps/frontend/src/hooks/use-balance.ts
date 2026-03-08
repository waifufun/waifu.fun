"use client";

import type { AddressLike, TChain } from "@waifufun/types";
import { useBalance as useWagmiBalance } from "wagmi";
import { bsc } from "wagmi/chains";
import { formatEther, type Address } from "viem";

export default function useBalance({ chain, address }: { chain: TChain; address: AddressLike | undefined }) {
	const query = useWagmiBalance({
		address: address as Address | undefined,
		chainId: bsc.id,
		query: {
			enabled: !!address,
			refetchInterval: 60_000,
			select: (data) => Number(formatEther(data.value)),
		},
	});

	return query;
}
