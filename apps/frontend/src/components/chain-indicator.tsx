"use client";

import { cn } from "@/lib/utils";
import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";
import Image from "next/image";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export default function ChainIndicator({
	chain,
	chainId,
	className,
}: {
	chain: TChain | null;
	chainId: SolanaNetworkIds | EvmChainIds | null;
	className?: string;
}) {
	const key = `${chain}_${chainId}`;
	const chainIcons: Record<string, { name: string; icon: string }> = {
		[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
		[`evm_${EvmChainIds.JejuMainnet}`]: { name: "Jeju", icon: "/chain-icons/jeju.svg" },
		[`evm_${EvmChainIds.JejuTestnet}`]: { name: "Jeju Testnet", icon: "/chain-icons/jeju.svg" },
		[`evm_${EvmChainIds.JejuLocalnet}`]: { name: "Jeju Localnet", icon: "/chain-icons/jeju.svg" },
		[`evm_${EvmChainIds.BSCMainnet}`]: { name: "BSC", icon: "/chain-icons/bsc.svg" },
		[`evm_${EvmChainIds.BSCTestnet}`]: { name: "BSC Testnet", icon: "/chain-icons/bsc.svg" },
		[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
		[`evm_${EvmChainIds.BaseSepolia}`]: { name: "Base Sepolia", icon: "/chain-icons/base.svg" },
		[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
		[`evm_${EvmChainIds.EthereumSepolia}`]: { name: "Ethereum Sepolia", icon: "/chain-icons/ethereum.svg" },
	};

	if (!chainIcons[key]) {
		return null;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Image
					id={key}
					src={chainIcons[key].icon}
					width={128}
					height={128}
					unoptimized
					alt={key}
					className={cn(["p-0.5 size-6 rounded-full select-none", className ? className : ""])}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<span>{chainIcons[key].name}</span>
			</TooltipContent>
		</Tooltip>
	);
}
