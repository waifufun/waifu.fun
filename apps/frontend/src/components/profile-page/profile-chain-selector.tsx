"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface IChainSelector {
	name: string;
	chain: TChain | null;
	chainId: SolanaNetworkIds | EvmChainIds | null;
	icon?: string;
}

export default function ProfileChainSelector() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const createQueryString = useCallback(
		(params: Record<string, TChain | SolanaNetworkIds | EvmChainIds | null>) => {
			const urlParams = new URLSearchParams(searchParams.toString());

			for (const [name, value] of Object.entries(params)) {
				if (value) {
					urlParams.set(name, String(value));
				} else {
					urlParams.delete(name);
				}
			}

			return urlParams.toString();
		},
		[searchParams],
	);

	const chains: IChainSelector[] = [
		{ name: "All", chain: null, chainId: null },
		{ name: "Solana", chain: "solana", chainId: SolanaNetworkIds.Mainnet, icon: "/chain-icons/solana.svg" },
		{ name: "Ethereum", chain: "evm", chainId: EvmChainIds.EthereumMainnet, icon: "/chain-icons/ethereum.svg" },
		{ name: "Base", chain: "evm", chainId: EvmChainIds.BaseMainnet, icon: "/chain-icons/base.svg" },
	];

	const activeKey = `${searchParams.get("chain")}:${searchParams.get("chainId")}`;

	return (
		<div className="w-fit h-[40px] flex items-center rounded-md bg-gradient-to-t from-[#121212] to-[#171717] p-[2px]">
			{chains.map((chain) => {
				const isActive = `${chain.chain}:${chain.chainId}` === activeKey;
				return (
					<Link
						key={`${chain.chain}_${chain.chainId}`}
						href={`${pathname}?${createQueryString({
							chain: chain.chain,
							chainId: chain.chainId,
						})}`}
						className="flex-1 h-full"
					>
						<button
							type="button"
							className={cn(
								"flex items-center justify-center h-full w-[40px] rounded-md transition-all",
								isActive ? "border border-autofun-background-action-highlight grayscale-0" : " text-white",
								"hover:outline-1 hover:outline-autofun-background-action-highlight",
							)}
						>
							{chain?.icon ? <Image src={chain.icon} width={128} height={128} alt="logo" className="size-5" /> : "All"}
						</button>
					</Link>
				);
			})}
		</div>
	);
}
