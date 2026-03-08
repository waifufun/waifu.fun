"use client";

import type { AddressLike } from "@waifufun/types";
import { useAccount } from "wagmi";

export default function useAddress() {
	const { address } = useAccount();
	return address as AddressLike | undefined;
}
