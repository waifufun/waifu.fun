import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";
import Image from "next/image";

export default function ChainIndicator({
	chain,
	chainId,
}: {
	chain: TChain | null;
	chainId: SolanaNetworkIds | EvmChainIds | null;
}) {
	const key = `${chain}_${chainId}`;
	const chainIcons: Record<string, string> = {
		[`solana_${SolanaNetworkIds.Mainnet}`]: "/chain-icons/solana.svg",
		[`evm_${EvmChainIds.BaseMainnet}`]: "/chain-icons/base.svg",
		[`evm_${EvmChainIds.EthereumMainnet}`]: "/chain-icons/ethereum.svg",
	};

	if (!chainIcons[key]) {
		return null;
	}

	return (
		<Image
			src={chainIcons[key]}
			width={128}
			height={128}
			unoptimized
			alt={key}
			className="bg-autofun-background-card/90 p-0.5 size-7 rounded-full"
		/>
	);
}
