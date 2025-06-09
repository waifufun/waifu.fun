"use client";

import { Button } from "@/components/ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortenAddress } from "@/lib/utils";
import { useIsClient } from "usehooks-ts";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./ui/menubar";
import { CreditCard, LogOut, User } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils"
import { useAnimation, type AnimationLevel } from "@/providers/animation-provider"

const btnClass = "bg-gradient-to-b from-[#171717] to-[#121212] text-white border-[#1A1A1A]";
export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();
	const { animationLevel } = useAnimation();
	const mobileMenuButtonClasses = cn(
		"w-full flex items-center justify-start px-4 py-3 text-sm text-gray-200 hover:bg-[#03FF24]/25 hover:text-white active:bg-[#03FF24]/35 active:text-white rounded-none transition-colors",
		animationLevel > 0 && "animate-button-pop-hover",
	  )
	const mobileMenuLinkClasses = cn(mobileMenuButtonClasses, "font-medium uppercase tracking-wider")
	

	if (!client) {
		return <Button className={btnClass}>Connect</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
			variant="outline"
			className={cn(
				mobileMenuLinkClasses,
				"border-2 border-[#03FF24] text-[#03FF24]",
				"hover:bg-[#03FF24]/20 hover:text-white",
				"active:bg-[#03FF24]/30 active:text-white",
				"my-2 mx-4 w-auto justify-center shadow-[3px_3px_0px_rgba(3,255,36,0.3)] hover:shadow-[2px_2px_0px_rgba(3,255,36,0.3)]",
			)}
			onClick={() => modal.setVisible(true)}
			>
				<CreditCard className="mr-2 h-5 w-5" /> CONNECT
			</Button>
		);
	}

	return (
		<Menubar>
			<MenubarMenu>
				<MenubarTrigger asChild>
					<div className="w-full justify-center">
						<Button className={btnClass}>
								{wallet?.connected && wallet.publicKey ? shortenAddress(wallet.publicKey.toBase58()) : "Connect"}
						</Button>
					</div>
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
