"use client";

import type { AddressLike } from "@waifufun/types";
import { getAddress } from "viem";
import { useAccount } from "wagmi";

export default function useAddress() {
	const { address } = useAccount();

	if (!address) {
		return undefined;
	}

	try {
		return getAddress(address) as AddressLike;
	} catch {
		return undefined;
	}
}
