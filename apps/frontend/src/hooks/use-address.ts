"use client";

import type { SolanaAddressLike } from "@waifufun/types";
import { useWallet } from "@solana/wallet-adapter-react";

export default function useAddress() {
	const wallet = useWallet();
	return wallet.publicKey?.toBase58() as SolanaAddressLike;
}
