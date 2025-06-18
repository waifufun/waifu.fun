"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIsClient } from "usehooks-ts";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./ui/menubar";
import { LogOut, User } from "lucide-react";
import Link from "next/link";

export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();

	if (!client) {
		return <Button>Connect</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
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
					<Button>
						{wallet?.connected && wallet.publicKey ? (
							<span className="truncate">{wallet.publicKey.toBase58()}</span>
						) : (
							"Connect"
						)}
					</Button>
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<Link href={`/profile/${wallet?.publicKey?.toBase58()}`}>
							<div className="flex items-center gap-1.5">
								<User size={20} className="size-4" />
								<span className="text-sm uppercase">Profile</span>
							</div>
						</Link>
					</MenubarItem>
					<MenubarItem onClick={() => wallet.disconnect()}>
						<div className="flex items-center gap-1.5 cursor-pointer">
							<LogOut size={20} className="size-4" />
							<span className="text-sm uppercase">Disconnect</span>
						</div>
					</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
		</Menubar>
	);
}
