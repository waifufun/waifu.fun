import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Image from "next/image";
import { useModal } from "./hooks/providers/UseModalContext";
import { useWallets } from "./hooks/providers/UseWalletContext";
import Settings from "./settings";

export default function Header() {
	const { openModal } = useModal();
	const { solanaWallets, evmWallets } = useWallets();

	return (
		<div className="flex items-center gap-4 justify-between h-[84px]">
			<Link href="/">
				<Image src="/logo_wide.png" height={44} width={88} className="h-11 w-auto rounded-lg" unoptimized alt="logo" />
			</Link>
			<Image src="/header-logo.svg" width={530} height={60} className="h-11 w-auto select-none" alt="logo" />
			<div className="flex items-center gap-2.5">
				<Input placeholder="Search..." className="w-[430px] h-11" />
				<Settings />
				<Link href="/create/import">
					<Button variant="outline">Create Token</Button>
				</Link>
				<Button onClick={() => openModal("WALLET_CONNECT")}>
					{solanaWallets || evmWallets ? "My Wallets" : "Connect Wallet"}
				</Button>
			</div>
		</div>
	);
}
