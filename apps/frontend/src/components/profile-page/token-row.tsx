import Image from "next/image";
import { CopyButton } from "../copy-button";
import Link from "next/link";
import type { EvmChainIds, SolanaNetworkIds } from "@waifufun/types";
import type { TChain } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Verified from "../verified";

export default function TokenRow({
	data,
	mode = "activity",
	verified,
}: {
	data: {
		image: string;
		title: string;
		ticker: string;
		marketCap?: number;
		contractAddress: string;
		amountHeld?: number;
		dollarWorth?: number;
		points?: number;
		chain: TChain | null;
		chainId: SolanaNetworkIds | EvmChainIds | null;
		direction?: 0 | 1;
		amountGotten?: number;
		swapAmount?: number;
		createdAt?: string;
		signature?: string;
	};
	mode?: "activity" | "wallet" | "points";
	verified?: boolean;
}) {
	// const key = `${data.chain}_${data.chainId}`;
	// const chainIcons: Record<string, { name: string; icon: string }> = {
	// 	[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
	// 	[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
	// 	[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	// };
	// const chainIcon = chainIcons[key];
	const dollarWorth = (data?.amountHeld ?? 0) * (data?.dollarWorth ?? 0);

	// formats really high decimal amounts
	const formatAmount = (value?: string | number) =>
		value != null
			? (Number(value) / 1e6).toLocaleString("en-US", {
					maximumFractionDigits: 6,
				})
			: "0";

	return (
		<div className="group w-full border-b-2 place-self-center border-[#FF2D78]/10 last:border-b-0 hover:bg-[#FF2D78]/5 transition-colors relative flex justify-between items-center h-[71px] p-2 sm:p-4 py-4 sm:py-8">
			<div className="flex items-center space-x-2 sm:space-x-4 flex-nowrap overflow-hidden">
				<Link href={`/token/${data.contractAddress}`} className="flex-shrink-0 flex items-center">
					{data.image ? (
						<Image
							src={data.image}
							unoptimized
							priority
							alt="Token Image"
							width={30}
							height={30}
							className="object-contain md:w-[40px] md:h-[40px]"
						/>
					) : (
						"N/A"
					)}
				</Link>
				<div className="flex items-start gap-2 h-full min-w-0 pr-2">
					<div className="flex flex-col justify-center min-w-0">
						<div className="flex items-center gap-1 sm:gap-2 flex-nowrap overflow-hidden">
							<Link href={`/token/${data.contractAddress}`} className="truncate max-w-full">
								<p className="text-[10px] sm:text-xs uppercase leading-none truncate hover:text-waifufun-background-action-highlight text-white cursor-pointer">
									{data.title}
								</p>
							</Link>
							<p className="text-[10px] sm:text-xs text-[#8C8C8C] leading-none flex-shrink-0">${data.ticker}</p>
						</div>
						<p className="text-[9px] sm:text-xs text-[#8C8C8C] leading-none flex gap-x-1 items-center overflow-hidden mt-1">
							<CopyButton
								className="h-[8px] w-[8px] sm:h-[10px] sm:w-[10px] flex-shrink-0"
								textToCopy={data.contractAddress}
							/>
							<span className="truncate">{`${data?.contractAddress?.slice(0, 4)}...${data?.contractAddress?.slice(-3)}`}</span>
						</p>
					</div>
					<div className="-mt-1 size-4">{verified && <Verified isVerified={true} />}</div>
				</div>
			</div>

			{mode === "activity" || mode === "wallet" ? (
				<div className="flex items-center justify-end flex-row space-x-2 sm:space-x-4 min-w-0">
					<div className="flex flex-col items-end space-y-0 text-right min-w-0">
						{mode === "activity" ? (
							<div className="w-full flex-shrink-0">
								<div className="flex flex-row space-x-0.5 sm:space-x-1 justify-end w-full flex-nowrap overflow-hidden">
									<p
										className={`text-[9px] sm:text-xs uppercase font-bold flex-shrink-0 ${
											data.direction === 0 ? "text-green-500" : "text-red-500"
										}`}
									>
										{data.direction === 0 ? "bought" : "sold"}
									</p>
									<p className="text-[9px] sm:text-xs uppercase font-semibold text-white inline truncate">
										{data.direction === 0 ? (
											<>
												{formatAmount(data.amountGotten)} <span className="text-gray-300">${data?.ticker}</span> for{" "}
												{(data.swapAmount ?? 0) / LAMPORTS_PER_SOL} SOL
											</>
										) : (
											<>
												{formatAmount(data.swapAmount)} <span className="text-gray-300">${data?.ticker}</span> for{" "}
												{(data.amountGotten ?? 0) / LAMPORTS_PER_SOL} SOL
											</>
										)}
									</p>
								</div>
								<p className="text-[8px] sm:text-xs text-gray-300 mt-0.5 sm:mt-1 text-right truncate">
									{data.createdAt
										? new Date(data.createdAt).toLocaleString("en-US", {
												day: "numeric",
												month: "short",
												year: "numeric",
												hour: "numeric",
												minute: "2-digit",
											})
										: ""}
								</p>
							</div>
						) : null}

						<div className="flex flex-col space-y-0 w-full items-end justify-center transition-all duration-300 mt-1">
							<p className="text-sm font-medium text-gray-200">{data.amountHeld?.toLocaleString()}</p>
							{data?.dollarWorth ? (
								<p className="text-waifufun-background-action-highlight text-xs sm:text-xs">
									${dollarWorth.toLocaleString()}
								</p>
							) : null}
						</div>
					</div>
					{mode === "activity" ? (
						<div className="flex justify-end items-center text-white text-base h-[60px] pl-2 flex-shrink-0">
							<Link
								href={
									mode === "activity" ? `https://solscan.io/tx/${data.signature}` : `/token/${data.contractAddress}`
								}
								target={mode === "activity" ? "_blank" : undefined}
							>
								<ExternalLink className="transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0 hover:bg-accent text-gray-400 hover:text-[#FF2D78] h-[14px] w-[14px] sm:h-[16px] sm:w-[16px]" />
							</Link>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
