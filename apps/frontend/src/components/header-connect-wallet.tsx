"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIsClient } from "usehooks-ts";
import { Wallet } from "lucide-react";
export default function HeaderConnectWallet() {
	const isClient = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();

	if (!isClient) {
		return (
			<Button className="h-10 px-4 py-2" variant="default" disabled>
				Connect Wallet
			</Button>
		);
	}

	if (wallet.connected && wallet.publicKey) {
		const address = wallet.publicKey.toBase58();
		const short = `${address.slice(0, 4)}...${address.slice(-4)}`;
		return (
			<Button
				className="h-10 px-4 py-2 font-medium"
				variant="default"
				onClick={() => modal.setVisible(true)}
				title={address}
			>
				{short}
			</Button>
		);
	}

	return (
		<Button
			className="h-10 px-4 py-2 font-medium"
			variant="default"
			onClick={() => modal.setVisible(true)}
		>
			<Wallet className="size-4 mr-2" />
			Connect Wallet
		</Button>
	);
}
