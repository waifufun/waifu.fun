"use client";
import Image from "next/image";
import useBalance from "@/hooks/use-balance";
import type { AddressLike } from "@autofun/types";
import { useWallets } from "./hooks/providers/UseWalletContext";
import Skeleton from "./skeleton-loading";

export default function BalanceMenu() {
	const wallets = useWallets();
	const solanaAddress = wallets.solanaWallets?.Mainnet.address;

	const balance = useBalance({
		chain: "solana",
		address: solanaAddress as AddressLike,
	});

	return (
		<div className="hidden lg:inline-flex h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 rounded-lg justify-center items-center gap-2">
			<Image src="/chain-icons/solana.svg" width={60} height={60} className="size-[20px]" unoptimized alt="balance" />
			<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-['Satoshi'] leading-tight">
				{balance?.isPending ? (
					<Skeleton />
				) : (
					new Intl.NumberFormat("en-US", {
						maximumFractionDigits: 3,
					}).format(Number(balance?.data))
				)}
			</div>
		</div>
		// <Menubar>
		// 	<MenubarMenu>
		// 		<MenubarTrigger asChild>

		// 		</MenubarTrigger>
		// 		<MenubarContent>
		// 			<MenubarItem>
		// 				<BalanceMenuItem icon="/chain-icons/solana.svg" chain="solana" />
		// 			</MenubarItem>
		// 			<MenubarItem>
		// 				<BalanceMenuItem icon="/chain-icons/ethereum.svg" chain="solana" />
		// 			</MenubarItem>
		// 			<MenubarItem>
		// 				<BalanceMenuItem icon="/chain-icons/base.svg" chain="solana" />
		// 			</MenubarItem>
		// 		</MenubarContent>
		// 	</MenubarMenu>
		// </Menubar>
	);
}

// const BalanceMenuItem = ({ icon, chain }: { icon: string; chain: TChain }) => {
// 	const balance = useBalance({ chain, address: "7rhxnLV8C77o6d8oz26AgK8x8m5ePsdeRawjqvojbjnQ" as AddressLike });
// 	console.log({ balance });
// 	return (
// 		<div className="flex items-center gap-2">
// 			<Image src={icon} width={20} height={20} className="size-[24px] object-scale-down" unoptimized alt="balance" />
// 			<div className="text-center justify-center text-autofun-text-primary text-base font-bold font-satoshi leading-tight">
// 				{balance?.data}
// 			</div>
// 		</div>
// 	);
// };
