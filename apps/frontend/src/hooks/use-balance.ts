import type { AddressLike, TChain } from "@autofun/types";
import { useQuery } from "@tanstack/react-query";

export default function useBalance({ chain, address }: { chain: TChain; address: AddressLike }) {
	const query = useQuery({
		queryKey: ["balance", chain, address],
		queryFn: async () => {
			return 5;
		},
	});

	return query;
}
