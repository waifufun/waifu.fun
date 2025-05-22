import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Image from "next/image";
import { useModal } from "./hooks/providers/UseModalContext";
import { useWallets } from "./hooks/providers/UseWalletContext";
import Settings from "./settings";
import { Menu } from "lucide-react";

export default function Header() {
	const { openModal } = useModal();
	const { solanaWallets, evmWallets } = useWallets();

	return (
		<div className="flex items-center gap-4 justify-between h-[68px]">
			<Link href="/">
				<Image src="/logo_wide.png" height={44} width={88} className="h-11 w-auto rounded-lg" unoptimized alt="logo" />
			</Link>
			<Input placeholder="Search..." className="w-[430px] h-11 hidden md:inline-block" />
			<div className="flex items-center gap-2.5">
				<div className="hidden md:flex">
					<Settings />
					<Link href="/create/import">
						<Button variant="outline">Create Token</Button>
					</Link>
				</div>
				<Button onClick={() => openModal("WALLET_CONNECT")}>
					{solanaWallets || evmWallets ? "My Wallets" : "Connect Wallet"}
				</Button>
				<div className="flex items-center">
					<button className="md:hidden items-center">
						<Menu size={32} />
					</button>
				</div>
			</div>
		</div>
	);
}
