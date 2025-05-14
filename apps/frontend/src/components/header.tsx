import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Image from "next/image";
import Settings from "./settings";

export default function Header() {
	return (
		<div className="px-4 flex items-center gap-4 justify-between h-[84px]">
			<Link href="/">
				<Image src="/logo_wide.svg" height={60} width={120} className="h-[60px] w-auto" unoptimized alt="logo" />
			</Link>
			<Image src="/header-logo.svg" width={530} height={60} className="h-[60px] w-auto select-none" alt="logo" />
			<div className="flex items-center gap-2.5">
				<Input placeholder="Search..." className="w-[430px] h-11" />
				<Settings />
				<Link href="/create/import">
					<Button variant="outline">Create Token</Button>
				</Link>
				<Button>Connect Wallet</Button>
			</div>
		</div>
	);
}
