"use client";

import { HELIUS_RPC_URL } from "@/lib/api";
import type { AddressLike, TChain } from "@waifufun/types";
import { useQuery } from "@tanstack/react-query";

export default function useTokenBalance({
	chain,
	contractAddress,
	address,
}: { chain: TChain; contractAddress: AddressLike; address: AddressLike }) {
	const query = useQuery({
		queryKey: ["balance", "token", chain, address, contractAddress],
		queryFn: async () => {
			if (chain === "solana") {
				const response = await fetch(HELIUS_RPC_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: "1",
						method: "getTokenAccountsByOwner",
						params: [
							address,
							{
								mint: contractAddress,
							},
							{
								encoding: "jsonParsed",
							},
						],
					}),
				});

				const data = await response.json();
				const uiAmount = data?.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
				return uiAmount || 0;
			}
			return 0;
		},
		refetchInterval: 10_000,
		enabled: !!address,
	});

	return query;
}
