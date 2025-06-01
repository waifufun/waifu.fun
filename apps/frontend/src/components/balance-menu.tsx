"use client";

import Image from "next/image";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./ui/menubar";

export default function BalanceMenu() {
	return (
		<Menubar>
			<MenubarMenu>
				<MenubarTrigger asChild>
					<div className="hidden lg:inline-flex h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 rounded-lg justify-center items-center gap-2">
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
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<BalanceMenuItem icon="/chain-icons/solana.svg" balance={5} />
					</MenubarItem>
					<MenubarItem>
						<BalanceMenuItem icon="/chain-icons/ethereum.svg" balance={5} />
					</MenubarItem>
					<MenubarItem>
						<BalanceMenuItem icon="/chain-icons/base.svg" balance={5} />
					</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
		</Menubar>
	);
}

const BalanceMenuItem = ({ icon, balance }: { icon: string; balance: number | string }) => {
	return (
		<div className="flex items-center gap-2">
			<Image src={icon} width={20} height={20} className="size-[24px] object-scale-down" unoptimized alt="balance" />
			<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-satoshi leading-tight">
				{balance}
			</div>
		</div>
	);
};
