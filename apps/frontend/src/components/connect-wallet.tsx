"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIsClient } from "usehooks-ts";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./ui/menubar";
import { LogOut, User, Wallet } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "./ui/sidebar";
import { useEffect } from "react";
import { authenticate, generateNonce, getWallets } from "@/lib/api";
import type { AddressLike } from "@autofun/types";

export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();
	const { state } = useSidebar();

	const isCollapsed = state === "collapsed";

	useEffect(() => {
		const handleAuthentication = async () => {
			if (wallet.connected && wallet.publicKey && wallet.signMessage) {
				try {
					const currentAddress = wallet.publicKey.toBase58();

					const walletsResponse = await getWallets();
					const existingSolanaAddress = walletsResponse?.wallets?.solana?.address;

					if (!existingSolanaAddress || existingSolanaAddress !== currentAddress) {
						console.log("Authenticating new or different Solana wallet:", currentAddress);

						const { nonce } = await generateNonce(currentAddress as AddressLike);
						const message = new TextEncoder().encode(nonce);
						const signature = await wallet.signMessage(message);
						const signatureBase58 = Buffer.from(signature).toString("base64");

						await authenticate(currentAddress as AddressLike, signatureBase58, "solana");
						console.log("Solana wallet authenticated successfully");
					} else {
						console.log("Solana wallet already authenticated for this address");
					}
				} catch (error) {
					console.error("Failed to authenticate Solana wallet:", error);
				}
			}
		};

		handleAuthentication();
	}, [wallet.connected, wallet.publicKey, wallet.signMessage]);

	if (!client) {
		return <Button className="w-full">{isCollapsed ? <Wallet size={16} /> : "Connect"}</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
				className="w-full"
				onClick={() => {
					modal.setVisible(true);
				}}
			>
				{isCollapsed ? <Wallet size={16} /> : "Connect"}
			</Button>
		);
	}

	return (
		<Menubar>
			<MenubarMenu>
				<MenubarTrigger asChild>
					<Button className="w-full">
						{isCollapsed ? (
							<User size={16} />
						) : wallet?.connected && wallet.publicKey ? (
							<span className="truncate">
								{wallet.publicKey.toBase58().slice(0, 4)}...{wallet.publicKey.toBase58().slice(-4)}
							</span>
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
