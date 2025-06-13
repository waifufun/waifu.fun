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

	return (
		<div className="group w-full border-b-2 place-self-center border-[#03FF24]/10 last:border-b-0 hover:bg-[#03FF24]/5 transition-colors relative flex justify-between items-center h-[71px] p-4 py-8">
			<div className="flex items-stretch space-x-4 space-y-0">
				<div className="place-items-center flex items-center">
					<Image
						src={data.image}
						unoptimized
						priority
						alt="Token Image"
						width={40}
						height={40}
						className="object-contain"
					/>
				</div>
				<div className="flex flex-col justify-between h-[60px] min-w-[140px] py-3">
					<div className="flex items-center gap-2">
						<p className="text-xs md:text-sm text-white uppercase leading-none">{data.title}</p>
						<p className="text-xs md:text-sm text-[#8C8C8C] leading-none">${data.ticker}</p>
					</div>
					<p className="text-xs text-[#8C8C8C] leading-none flex gap-x-2 items-center justify-items-center">
						<CopyButton className="h-[10px] w-[10px]" textToCopy={data.contractAddress} />{" "}
						{`${data.contractAddress.slice(0, 6)}...${data.contractAddress.slice(-4)}`}
					</p>
				</div>
			</div>

			{mode === "activity" || mode === "wallet" ? (
				<div className="flex items-center justify-center flex-row space-x-4">
					<div className="flex flex-col items-end space-y-1">
						<div className="flex flex-row space-x-2 w-full justify-end">
							{mode === "activity" ? (
								<>
									<p className="text-xs md:text-base font-semibold text-yellow-400">Mcap</p>
									<p className="text-xs md:text-base font-semibold text-yellow-400">
										{formatNumber(data.marketCap, false, true)}
									</p>
								</>
							) : null}
						</div>
						<div className="flex flex-col space-y-1 w-full items-end justify-center transition-all duration-300">
							<p className="text-white font-medium text-xs md:text-base">{data.amountHeld}</p>
							{data?.dollarWorth ? (
								<p className="text-autofun-background-action-highlight text-sm md:text-base">
									${data.dollarWorth.toLocaleString()}
								</p>
							) : null}
						</div>
					</div>
					{mode === "activity" ? (
						<div className="text-white place-items-center text-base">
							<Link href={`/token/${data.contractAddress}`}>
								<Image
									src={"/profile/link.svg"}
									alt="link icon"
									width={24}
									height={24}
									className="object-contain w-5 h-5 md:w-6 md:h-6"
								/>
							</Link>
							<div className="flex flex-col justify-center mt-3 h-full">
								<div className="space-y-0 flex flex-row">
									<p className="text-xs text-center text-yellow-400">+ {data.points} pts</p>
								</div>
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
