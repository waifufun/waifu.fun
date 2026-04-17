"use client";

import type { AddressLike, TChain } from "@waifufun/types";
import { type Address, erc20Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { bsc } from "wagmi/chains";

export default function useTokenBalance({
	chain: _chain,
	contractAddress,
	address,
}: { chain: TChain; contractAddress: AddressLike; address: AddressLike | undefined }) {
	const query = useReadContracts({
		allowFailure: false,
		contracts: address
			? [
					{
						address: contractAddress as Address,
						abi: erc20Abi,
						functionName: "balanceOf",
						args: [address as Address],
						chainId: bsc.id,
					},
					{
						address: contractAddress as Address,
						abi: erc20Abi,
						functionName: "decimals",
						chainId: bsc.id,
					},
				]
			: undefined,
		query: {
			enabled: !!address && !!contractAddress,
			refetchInterval: 10_000,
			select: ([balance, decimals]) => Number(formatUnits(balance, Number(decimals))),
		},
	});

	return query;
}
