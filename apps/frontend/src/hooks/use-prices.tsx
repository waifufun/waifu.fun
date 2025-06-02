"use client";

import { getPrices } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export default function usePrices() {
	const query = useQuery({
		queryKey: ["prices"],
		queryFn: getPrices,
		refetchInterval: 60_000,
	});
	return query;
}
