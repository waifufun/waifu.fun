"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { useIsClient } from "usehooks-ts";
import { Wallet, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logOut } from "@/lib/api";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";

export default function HeaderConnectWallet() {
	const isClient = useIsClient();
	const { address, isConnected } = useAccount();
	const { disconnect } = useDisconnect();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const handleSignOut = async () => {
		setDropdownOpen(false);
		try {
			await logOut("evm");
		} catch {
			// ignore API errors
		}
		disconnect();
	};

	const greenButtonClass =
		"h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm";

	if (!isClient) {
		return (
			<Button className={greenButtonClass} disabled>
				Connect Wallet
			</Button>
		);
	}

	if (isConnected && address) {
		const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
		return (
			<Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<PopoverTrigger asChild>
					<Button className={greenButtonClass} title={address} type="button">
						{short}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={8}
					className="w-48 rounded-xl border border-white/20 bg-white/25 p-1 backdrop-blur-md"
				>
					<button
						type="button"
						onClick={handleSignOut}
						className="flex w-full items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
					>
						<LogOut className="size-4" />
						Sign out
					</button>
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<ConnectButton.Custom>
			{({ openConnectModal }) => (
				<Button className={greenButtonClass} onClick={openConnectModal}>
					<Wallet className="size-4 mr-2" />
					Connect Wallet
				</Button>
			)}
		</ConnectButton.Custom>
	);
}
