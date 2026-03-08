"use client";

import type { AddressLike, TChain } from "@waifufun/types";
import { useReadContract } from "wagmi";
import { bsc } from "wagmi/chains";
import { erc20Abi, formatUnits, type Address } from "viem";

export default function useTokenBalance({
	chain,
	contractAddress,
	address,
}: { chain: TChain; contractAddress: AddressLike; address: AddressLike | undefined }) {
	const query = useReadContract({
		address: contractAddress as Address,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: address ? [address as Address] : undefined,
		chainId: bsc.id,
		query: {
			enabled: !!address && !!contractAddress,
			refetchInterval: 10_000,
			select: (data) => Number(formatUnits(data, 18)),
		},
	});

	return query;
}
