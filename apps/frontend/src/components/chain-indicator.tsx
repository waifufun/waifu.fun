"use client";

import { cn } from "@/lib/utils";
import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";
import Image from "next/image";
import { Fragment } from "react";
import { Tooltip } from "react-tooltip";

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
		[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
		[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	};

	if (!chainIcons[key]) {
		return null;
	}

	return (
		<Fragment>
			<Tooltip anchorSelect={`#${key}`}>
				<span>{chainIcons[key].name}</span>
			</Tooltip>
			<Image
				id={key}
				src={chainIcons[key].icon}
				width={128}
				height={128}
				unoptimized
				alt={key}
				className={cn(["bg-autofun-background-card/90 p-0.5 size-6 rounded-full", className ? className : ""])}
			/>
		</Fragment>
	);
}
