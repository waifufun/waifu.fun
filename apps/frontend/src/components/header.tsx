import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Image from "next/image";
import { useModal } from "./hooks/providers/UseModalContext";
import { useWallets } from "./hooks/providers/UseWalletContext";
import { Menu, Trophy } from "lucide-react";

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
				<Input placeholder="Search..." className="w-[430px] h-11 hidden md:inline-block" />
			</div>
			<div className="flex items-center gap-2.5">
				{/* Points */}
				<div className="hidden lg:inline-flex h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 rounded-lg justify-center items-center gap-2">
					<Trophy size={20} className="text-autofun-background-action-highlight" />
					<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-['Satoshi'] leading-tight">
						250
					</div>
				</div>
				{/* Balance */}
				<div className="hidden lg:inline-flex  h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 rounded-lg justify-center items-center gap-2">
					<Image
						src="/chain-icons/solana.svg"
						width={60}
						height={60}
						className="size-[20px]"
						unoptimized
						alt="balance"
					/>
					<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-['Satoshi'] leading-tight">
						1.83
					</div>
				</div>
				<div className="hidden md:flex gap-2.5">
					<Link href="/create/import">
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
