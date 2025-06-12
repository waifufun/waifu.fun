"use client";

import Image from "next/image";
import { CopyButton } from "../copy-button";
import type { TChain } from "@autofun/types";
import type { SolanaNetworkIds, EvmChainIds } from "@autofun/types";
import { Trophy } from "lucide-react";

export default function ProfileHeader({
	data,
}: {
	data: {
		username: string;
		address: string;
		tokensBought: number;
		tokensCreated: number;
		chains: {
			chain: TChain | null;
			chainId: SolanaNetworkIds | EvmChainIds | null;
			amount: number;
		}[];
	};
}) {
	// const chainIcons: Record<string, { name: string; icon: string }> = {
	// 	[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
	// 	[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
	// 	[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	// };

	return (
		<div className="bg-black/30 border-2 border-[#03FF24]/40 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.3)] md:max-h-[182px] md:max-w-full space-y-1 text-white flex flex-col md:flex-row items-center justify-between p-4 w-full mx-auto gap-0">
			<div className="border-4 h-fit border-[#03FF24]/60 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.4)] relative w-[150px]">
				<Image src="/create/test-img.png" alt="Profile" width={150} height={150} className="object-cover" />
				<div className="absolute px-2 w-full justify-between top-2 flex gap-2">
					<button
						type="button"
						onClick={() => console.log("upload button")}
						className="cursor-pointer bg-[#0C0C0C]/90 rounded-md p-1 size-6"
					>
						<Image src="/profile/upload.svg" alt="Profile" width={24} height={24} className="object-cover" />
					</button>
					<button
						type="button"
						onClick={() => console.log("refresh button")}
						className="cursor-pointer bg-[#0C0C0C]/90 rounded-md p-1 w-6 h-6"
					>
						<Image src="/profile/rotate.svg" alt="Profile" width={14} height={14} className="object-cover" />
					</button>
				</div>
			</div>

			<div className="md:ml-6 space-y-1 mb-2 flex flex-col h-full">
				<h1 className="text-2xl mt-2 sm:text-3xl font-bold text-gray-100 text-center md:text-start uppercase tracking-wider">
					{data.username}
				</h1>

				<div className="flex w-full items-center justify-center sm:justify-start gap-1 mt-1 text-sm font-mono text-gray-400 bg-black/40 py-1 border border-[#03FF24]/30 rounded-none shadow-inner">
					<span className="p-1 truncate">{data.address}</span>
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
				<div className="flex gap-2 mt-2">
					<div className="px-2 py-1 flex items-center justify-center md:justify-start w-full">
						<Trophy size={20} className="text-autofun-background-action-highlight" />
						<p className="px-2 font-semibold text-[#03FF24] text-base">12</p>
					</div>
				</div>
			</div>

			<div className="flex flex-col md:flex-col w-full space-y-2 md:w-fit place-content-center gap-2 ml-auto">
				<div className="bg-[#03FF24]/10 text-[#03FF24] border border-[#03FF24]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] text-center">
					Tokens Created: <span className="font-bold">{data.tokensCreated}</span>
				</div>
				<div className="bg-[#03FF24]/10 text-[#03FF24] border border-[#03FF24]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] text-center">
					Tokens Bought: <span className="font-bold">{data.tokensBought}</span>
				</div>
			</div>
		</div>
	);
}
