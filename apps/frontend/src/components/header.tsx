import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Image from "next/image";
import { useModal } from "./hooks/providers/UseModalContext";

export default function Header() {
	const {openModal} = useModal();

	return (
		<div className="px-4 flex items-center gap-4 justify-between h-[84px]">
			<Link href="/">
				<Image src="/logo_wide.svg" height={60} width={120} className="h-[60px] w-auto" unoptimized alt="logo" />
			</Link>
			<Image src="/header-logo.svg" width={530} height={60} className="h-[60px] w-auto" alt="logo" />
			<div className="flex items-center gap-4">
				<Input placeholder="Search..." className="w-[430px]" />
				<Link href="/create/import">
					<Button variant="outline">Create Token</Button>
				</Link>
				<Button>Connect Wallet</Button>
			</div>
		</div>
	);
}
