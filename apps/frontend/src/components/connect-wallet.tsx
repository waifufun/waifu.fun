"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortenAddress } from "@/lib/utils";

export default function ConnectWallet() {
	const modal = useWalletModal();
	const wallet = useWallet();
	return (
		<Button
			onClick={() => {
				if (wallet?.connected) {
					return wallet.disconnect();
				}

				return modal.setVisible(true);
			}}
		>
			{wallet?.connected && wallet.publicKey ? shortenAddress(wallet.publicKey.toBase58()) : "Connect Wallet"}
		</Button>
	);
}
