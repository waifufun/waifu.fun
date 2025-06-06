"use client";

import Image from "next/image";
import { CopyButton } from "../copy-button";
import type { TChain } from "@autofun/types";
import { SolanaNetworkIds, EvmChainIds } from "@autofun/types";

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
	const chainIcons: Record<string, { name: string; icon: string }> = {
		[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
		[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
		[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	};

	return (
		<div className="bg-[#0C0C0C] md:max-h-[182px] md:max-w-[800px] space-y-4 text-white flex flex-col md:flex-row items-center justify-between p-4 rounded-sm w-full mx-auto gap-0">
			<div className="relative w-[150px] h-[150px]">
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

			<div className="ml-6 space-y-1 mb-2 flex flex-col h-full">
				<h1 className="text-lg font-semibold uppercase">{data.username}</h1>
				<p className="text-sm text-gray-400 items-center flex">
					<CopyButton className="mr-2" textToCopy={data.address} />
					{data.address}
				</p>
				<div className="flex gap-2 mt-2">
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
				</div>
			</div>

			<div className="flex flex-row md:flex-col w-full md:w-fit place-content-center md:place-content-end gap-2 ml-auto">
				<div className="bg-gradient-to-t from-[#121212] to-[#171717] h-[70px] w-[166px] flex flex-row items-center place-content-center space-x-2 rounded-sm">
					<p className="text-white font-bold text-base">Tokens Bought</p>
					<p className="text-lg  text-autofun-background-action-highlight font-semibold">{data.tokensBought}</p>
				</div>
				<div className="bg-gradient-to-t from-[#121212] to-[#171717] h-[70px] w-[166px] flex flex-row items-center place-content-center space-x-2 rounded-sm">
					<p className="text-white font-bold text-base">Tokens Created</p>
					<p className="text-base text-autofun-background-action-highlight font-semibold">{data.tokensCreated}</p>
				</div>
			</div>
		</div>
	);
}
