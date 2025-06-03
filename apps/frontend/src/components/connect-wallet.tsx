"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortenAddress } from "@/lib/utils";
import { Popover, PopoverContent } from "./ui/popover";
import { PopoverTrigger } from "@radix-ui/react-popover";
import { useIsClient } from "usehooks-ts";

const btnClass = "bg-gradient-to-b from-[#171717] to-[#121212] text-white border-[#1A1A1A]";

export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();

	if (!client) {
		return <Button className={btnClass}>Connect Wallet</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
				className={btnClass}
				onClick={() => {
					modal.setVisible(true);
				}}
			>
				Connect Wallet
			</Button>
		);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button className={btnClass}>
					{wallet?.connected && wallet.publicKey ? shortenAddress(wallet.publicKey.toBase58()) : "Connect Wallet"}
				</Button>
			</PopoverTrigger>
			<PopoverContent>{/* <div onClick={() => wallet.disconnect()}>Disconnect</div> */}</PopoverContent>
		</Popover>
	);
}
