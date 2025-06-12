import Image from "next/image";
import { CopyButton } from "../copy-button";
import Link from "next/link";
import type { EvmChainIds, SolanaNetworkIds } from "@autofun/types";
import type { TChain } from "@autofun/types";
import { formatNumber } from "@/lib/utils";

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
		dollarWorth?: number;
		points?: number;
		chain: TChain | null;
		chainId: SolanaNetworkIds | EvmChainIds | null;
	};
	mode?: "activity" | "wallet" | "points";
}) {
	// const key = `${data.chain}_${data.chainId}`;
	// const chainIcons: Record<string, { name: string; icon: string }> = {
	// 	[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
	// 	[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
	// 	[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	// };
	// const chainIcon = chainIcons[key];

	// if mode equals activity show mcap, amount bought, amount pts earned, link to token page, and dollarworth

	return (
		<div className="group w-full place-self-center border-[#03FF24]/10 last:border-b-0 hover:bg-[#03FF24]/5 transition-colors relative flex justify-between items-center h-[94px] px-4 py-13">
			<div className="flex items-center space-x-4">
				<div className="w-[60px] h-[60px]">
					<Image
						src={data.image}
						unoptimized
						priority
						alt="Token Image"
						width={60}
						height={60}
						className="object-contain"
					/>
				</div>

				<div className="flex flex-col justify-center min-w-[140px]">
					<div className="flex items-center gap-2">
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
				<div className="flex items-center justify-center flex-row space-x-4">
					<div className="flex flex-col items-end">
						<div className="flex flex-row space-x-2 w-full justify-end">
							{mode === "activity" ? (
								<>
									<p className="text-base font-bold text-yellow-400">Mcap</p>
									<p className="text-base font-semibold text-yellow-400">{formatNumber(data.marketCap, false, true)}</p>
								</>
							) : null}
						</div>
						<div className="flex flex-col w-full space-y-1 items-end justify-center transition-all duration-300">
							<p className="text-white font-medium text-base">{data.amountHeld}</p>
							{data?.dollarWorth ? (
								<p className="text-autofun-background-action-highlight text-base">
									${data.dollarWorth.toLocaleString()}
								</p>
							) : null}
						</div>
					</div>
					{mode === "activity" ? (
						<div className="text-white text-base">
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
					) : null}
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
