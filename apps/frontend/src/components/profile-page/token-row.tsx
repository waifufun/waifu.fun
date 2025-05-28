import Image from "next/image";
import { CopyButton } from "../copy-button";
import Link from "next/link";
import { EvmChainIds, SolanaNetworkIds } from "@autofun/types";
import type { TChain } from "@autofun/types";

export default function TokenRow({
	data,
	mode = "activity",
}: {
	data: {
		image: string;
		title: string;
		ticker: string;
		marketCap: number;
		contractAddress: string;
		amountHeld: number;
		dollarWorth: number;
		points?: number;
		chain: TChain | null;
		chainId: SolanaNetworkIds | EvmChainIds | null;
	};
	mode?: "activity" | "wallet" | "points";
}) {
	const key = `${data.chain}_${data.chainId}`;
	const chainIcons: Record<string, { name: string; icon: string }> = {
		[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
		[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
		[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum-bold.svg" },
	};
	const chainIcon = chainIcons[key];

	return (
		<div className="group rounded-lg bg-transparent place-self-center hover:bg-[#0C0C0C] relative flex justify-between items-center w-[750px] h-[94px] px-4 py-2">
			<div className="flex items-center">
				<div className="w-[60px] h-[60px] mr-4">
					<Image src={data.image} alt="Token Image" width={60} height={60} className="rounded-md object-contain" />
				</div>

				<div className="flex flex-col justify-center min-w-[140px]">
					<div className="flex items-center gap-1">
						{chainIcon ? (
							<Image
								src={chainIcon.icon}
								alt={`${chainIcon.name} chain icon`}
								width={24}
								height={24}
								className="object-contain"
							/>
						) : (
							<div className="w-6 h-6 bg-gray-500 rounded" />
						)}

						<p className="text-xl text-white uppercase mr-1 leading-none">{data.title}</p>
						<p className="text-base text-[#8C8C8C] leading-none">${data.ticker}</p>
					</div>
					<p className="text-base mt-3 ml-1.5 text-[#8C8C8C] leading-none">
						<CopyButton textToCopy={data.contractAddress} />{" "}
						{`${data.contractAddress.slice(0, 6)}...${data.contractAddress.slice(-4)}`}
					</p>
				</div>
			</div>

			{mode === "activity" || mode === "wallet" ? (
				<div className="flex items-center gap-x-8 place-items-end transition-all duration-300 ease-in-out group-hover:gap-x-10">
					<div className="flex flex-col h-full w-full space-y-1 justify-end transition-all duration-300">
						{mode === "activity" ? (
							<>
								<p className="text-base font-medium text-white">Mcap</p>
								<p className="text-lg font-semibold text-autofun-background-action-highlight">
									${data.marketCap.toLocaleString()}
								</p>
							</>
						) : null}
					</div>

					<div className="self-stretch w-px bg-[#1E1E1E]" />

					<div className="flex flex-col w-full space-y-1 justify-center transition-all duration-300">
						<p className="text-white font-medium text-base">{data.amountHeld}</p>
						<p className="text-[#8C8C8C] text-base">${data.dollarWorth.toLocaleString()}</p>
					</div>
					<div className="w-0 overflow-hidden group-hover:w-12 transition-all duration-300 ease-in-out flex-shrink-0">
						<Link href={`/token/${data.contractAddress}`}>
							<Image
								src={"/profile/link.svg"}
								alt="link icon"
								width={24}
								height={24}
								className="object-contain w-6 h-6"
							/>
						</Link>
					</div>
				</div>
			) : (
				<div className="flex flex-col justify-center h-full">
				<div className="space-y-0">
				  <p className="text-base text-white">Points</p>
				  <p className="text-base text-autofun-background-action-highlight">{data.points} FUN</p>
				</div>
			  </div>
			  
			)}
		</div>
	);
}
