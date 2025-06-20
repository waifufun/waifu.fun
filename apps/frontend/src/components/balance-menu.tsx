"use client";
import Image from "next/image";
import useBalance from "@/hooks/use-balance";
import type { AddressLike } from "@autofun/types";
import Skeleton from "./skeleton-loading";
import useAddress from "@/hooks/use-address";
import { cn } from "@/lib/utils";
import { useSidebar } from "./ui/sidebar";

export default function BalanceMenu() {
	const solanaAddress = useAddress();
	const { open } = useSidebar();
	const balance = useBalance({
		chain: "solana",
		address: solanaAddress as AddressLike,
	});

	if (!solanaAddress) return null;

	return (
		<div
			className={cn(
				"hidden h-10 px-4 py-2 bg-gradient-to-b from-neutral-900/80 to-neutral-900/80 justify-center items-center gap-2",
				open ? "xl:inline-flex" : "lg:inline-flex",
			)}
		>
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
	);
}
