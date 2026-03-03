"use client";

import { useCallback } from "react";
import { Button } from "./ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EvmChainIds, SolanaNetworkIds, type TChain } from "@waifufun/types";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface IChainSelector {
	name: string;
	chain: TChain | null;
	chainId: SolanaNetworkIds | EvmChainIds | null;
	icon?: string;
}

export default function ChainSelector() {
	const router = useRouter();
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
		{ name: "All", chain: null, chainId: null, icon: "/chain-icons/blockchains.png" },
		{ name: "Solana", chain: "solana", chainId: SolanaNetworkIds.Mainnet, icon: "/chain-icons/solana.svg" },
		{ name: "Ethereum", chain: "evm", chainId: EvmChainIds.EthereumMainnet, icon: "/chain-icons/ethereum.svg" },
		{ name: "Base", chain: "evm", chainId: EvmChainIds.BaseMainnet, icon: "/chain-icons/base.svg" },
	];

	const activeKey = `${searchParams.get("chain")}:${searchParams.get("chainId")}`;

	return (
		<div className="flex items-center gap-2">
			{chains.map((chain) => {
				const isActive = `${chain.chain}:${chain.chainId}` === activeKey;
				return (
					<Link
						key={`${chain.chain}_${chain.chainId}`}
						href={`${pathname}?${createQueryString({
							chain: chain.chain,
							chainId: chain.chainId,
						})}`}
					>
						<Button variant={isActive ? "outline" : "secondary"} size="icon">
							{chain?.icon ? (
								<Image
									src={chain.icon}
									width={128}
									height={128}
									alt="logo"
									className={cn([isActive ? "grayscale-0" : "grayscale", "size-5"])}
								/>
							) : null}
						</Button>
					</Link>
				);
			})}
		</div>
	);
}
