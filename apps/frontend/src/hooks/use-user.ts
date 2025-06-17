'use client'
import { useQuery } from "@tanstack/react-query";
import { getUser } from "@/lib/api";
import type { AddressLike } from "@autofun/types";

export default function useUser(address: AddressLike | undefined) {
  return useQuery({
    queryKey: ["user", address],
    queryFn: async () => {
      if (!address) throw new Error("Address is required");
      return await getUser({ address });
    },
    enabled: !!address,
  });
}
