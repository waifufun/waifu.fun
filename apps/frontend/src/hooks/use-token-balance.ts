"use client";

import type { AddressLike, TChain } from "@autofun/types";
import { useQuery } from "@tanstack/react-query";

export default function useBalance({
	chain,
	contractAddress,
	address,
}: { chain: TChain; contractAddress: AddressLike; address: AddressLike }) {
	const query = useQuery({
		queryKey: ["balance", "token", chain, address, contractAddress],
		queryFn: async () => {
			return 5;
		},
	});

	return query;
}
