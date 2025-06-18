"use client";

import { CopyButton } from "../copy-button";
import type { AddressLike, TChain } from "@autofun/types";
import type { SolanaNetworkIds, EvmChainIds } from "@autofun/types";
import { Trophy } from "lucide-react";
import AvatarImage from "./avatar-image";

export default function ProfileHeader({
	data,
}: {
	data: {
		username: string;
		address: AddressLike;
		tokensBought: number;
		tokensCreated: number;
		chains: {
			chain: TChain | null;
			chainId: SolanaNetworkIds | EvmChainIds | null;
			amount: number;
		}[];
		points: number;
		image: string;
	};
}) {
	// const chainIcons: Record<string, { name: string; icon: string }> = {
	// 	[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
	// 	[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
	// 	[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	// };
	return (
		<div className="bg-black/30 border-2 border-[#03FF24]/40 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.3)] md:max-h-[182px] md:max-w-full space-y-1 text-white flex flex-col md:flex-row items-center justify-between p-4 w-full mx-auto gap-0">
			<AvatarImage image={data?.image} address={data?.address} />
			<div className="md:ml-6 space-y-1 mb-2 flex flex-col h-full">
				<h1 className="text-2xl mt-2 sm:text-3xl font-bold text-gray-100 text-center md:text-start uppercase tracking-wider">
					{data.username}
				</h1>

				<div className="flex w-full max-w-[320px] max-h-[30px] items-center justify-center sm:justify-start gap-1 mt-1 text-sm font-mono text-gray-400 bg-black/40 py-1 border border-[#03FF24]/30 rounded-none shadow-inner">
					<span className="p-2 truncate">{data.address}</span>
					<CopyButton
						textToCopy={data.address}
						className=" mr-2 text-[#03FF24]/70 hover:text-[#03FF24] cursor-pointer flex-shrink-0"
					/>
				</div>
				{/* <div className="flex gap-2 mt-2">
					{data.chains.map(({ chain, chainId, amount }) => {
						// for lint
						const key = `${chain}_${chainId}`;
						const chainIcon = chainIcons[key];

						return (
							<div
								key={key}
								className="bg-[#171717] bg-opacity-10 px-2 py-1 rounded-md flex items-center justify-center"
							>
								{chainIcon ? (
									<Image src={chainIcon.icon} alt={`${chainIcon.name} icon`} width={24} height={24} />
								) : (
									<div className="w-6 h-6 bg-gray-500 rounded" />
								)}
								<p className="px-2 text-base font-bold">{amount}</p>
							</div>
						);
					})}
				</div> */}
				<div className="flex gap-0 mt-1">
					<div className="px-0 py-1 flex items-center justify-center md:justify-start w-full">
						<Trophy size={20} className="text-autofun-background-action-highlight" />
						<p className="px-2 font-semibold text-[#03FF24] text-base">{data.points}</p>
					</div>
				</div>
			</div>

			<div className="h-full flex flex-col md:flex-col w-full space-y-2 place-self-start md:w-fit place-content-center ml-auto">
				<div className="bg-[#03FF24]/10 text-xs text-[#03FF24] border border-[#03FF24]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] text-center">
					Tokens Created: <span className="font-bold">{data.tokensCreated}</span>
				</div>
				<div className="bg-[#03FF24]/10 text-xs text-[#03FF24] border border-[#03FF24]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] text-center">
					Tokens Bought: <span className="font-bold">{data.tokensBought}</span>
				</div>
			</div>
		</div>
	);
}
