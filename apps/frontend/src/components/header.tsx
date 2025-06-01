import Link from "next/link";
import { Button } from "./ui/button";
import Image from "next/image";
import { useModal } from "./hooks/providers/UseModalContext";
import { useWallets } from "./hooks/providers/UseWalletContext";
import { Menu, Trophy } from "lucide-react";
import BalanceMenu from "./balance-menu";
import SearchMenu from "./search-menu";

export default function Header() {
	const { openModal } = useModal();
	const { solanaWallets, evmWallets } = useWallets();

	return (
		<div className="flex items-center gap-4 justify-between h-[68px]">
			<div className="flex items-center gap-4">
				<Link href="/" className="shrink-0 grow">
					<Image
						src="/logo_wide.svg"
						height={43.98}
						width={87.97}
						className="h-11 w-auto rounded-lg"
						unoptimized
						alt="logo"
					/>
				</Link>
				<SearchMenu />
			</div>
			<div className="flex items-center gap-2.5">
				{/* Points */}
				<div className="hidden lg:inline-flex h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 rounded-lg justify-center items-center gap-2">
					<Trophy size={20} className="text-autofun-background-action-highlight" />
					<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-['Satoshi'] leading-tight">
						0
					</div>
				</div>
				{/* Balance */}
				<BalanceMenu />
				<div className="hidden md:flex gap-2.5">
					<Link href="/create">
						<Button variant="outline">Create Token</Button>
					</Link>
				</div>
				<Button onClick={() => openModal("WALLET_CONNECT")}>
					{solanaWallets || evmWallets ? "My Wallets" : "Connect Wallet"}
				</Button>
				<div className="flex items-center">
					<button className="md:hidden items-center" type="button">
						<Menu size={32} />
					</button>
				</div>
			</div>
		</div>
	);
}
