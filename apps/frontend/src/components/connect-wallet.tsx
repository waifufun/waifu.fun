"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortenAddress } from "@/lib/utils";
import { useIsClient } from "usehooks-ts";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./ui/menubar";
import { LogOut, User } from "lucide-react";
import Link from "next/link";

const btnClass = "bg-gradient-to-b from-[#171717] to-[#121212] text-white border-[#1A1A1A]";

export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();

	if (!client) {
		return <Button className={btnClass}>Connect</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
				className={btnClass}
				onClick={() => {
					modal.setVisible(true);
				}}
			>
				Connect
			</Button>
		);
	}

	return (
		<Menubar>
			<MenubarMenu>
				<MenubarTrigger asChild>
					<Button className={btnClass}>
						{wallet?.connected && wallet.publicKey ? shortenAddress(wallet.publicKey.toBase58()) : "Connect"}
					</Button>
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<Link href={`/profile/${wallet?.publicKey?.toBase58()}`}>
							<div className="flex items-center gap-1.5">
								<User size={20} />
								<span className="text-base font-medium">Profile</span>
							</div>
						</Link>
					</MenubarItem>
					<MenubarItem onClick={() => wallet.disconnect()}>
						<div className="flex items-center gap-1.5 cursor-pointer">
							<LogOut size={20} />
							<span className="text-base font-medium">Disconnect</span>
						</div>
					</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
		</Menubar>
	);
}
