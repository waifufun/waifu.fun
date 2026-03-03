import { connection } from "@/lib/api";
import type { AddressLike, TChain } from "@waifufun/types";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

export default function useBalance({ chain, address }: { chain: TChain; address: AddressLike }) {
	const query = useQuery({
		queryKey: ["balance", chain, address],
		queryFn: async () => {
			if (chain === "solana") {
				const accountPubKey = new PublicKey(address);
				const lamports = await connection.getBalance(accountPubKey);
				const sol = lamports / LAMPORTS_PER_SOL;
				return sol;
			}
			return 0;
		},
		refetchInterval: 60_000,
	});

	return query;
}
