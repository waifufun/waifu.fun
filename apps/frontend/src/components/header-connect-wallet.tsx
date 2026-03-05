"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIsClient } from "usehooks-ts";
import { Wallet, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logOut } from "@/lib/api";

export default function HeaderConnectWallet() {
	const isClient = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const handleSignOut = async () => {
		setDropdownOpen(false);
		try {
			await logOut("solana");
		} catch {
			// ignore API errors
		}
		wallet.disconnect();
	};

	const greenButtonClass = "h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm";

	if (!isClient) {
		return (
			<Button className={greenButtonClass} disabled>
				Connect Wallet
			</Button>
		);
	}

	if (wallet.connected && wallet.publicKey) {
		const address = wallet.publicKey.toBase58();
		const short = `${address.slice(0, 4)}...${address.slice(-4)}`;
		return (
			<Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<PopoverTrigger asChild>
					<Button
						className={greenButtonClass}
						title={address}
						type="button"
					>
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
		<Button
			className={greenButtonClass}
			onClick={() => modal.setVisible(true)}
		>
			<Wallet className="size-4 mr-2" />
			Connect Wallet
		</Button>
	);
}
