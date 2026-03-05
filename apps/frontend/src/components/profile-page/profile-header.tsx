"use client";

import { CopyButton } from "../copy-button";
import type { AddressLike, TChain } from "@waifufun/types";
import type { SolanaNetworkIds, EvmChainIds } from "@waifufun/types";
import AvatarImage from "./avatar-image";
import { formatNumber } from "@/lib/utils";

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
		totalPoints: number;
		weeklyPoints: number;
		image: string;
	};
}) {
	// const chainIcons: Record<string, { name: string; icon: string }> = {
	// 	[`solana_${SolanaNetworkIds.Mainnet}`]: { name: "Solana", icon: "/chain-icons/solana.svg" },
	// 	[`evm_${EvmChainIds.BaseMainnet}`]: { name: "Base", icon: "/chain-icons/base.svg" },
	// 	[`evm_${EvmChainIds.EthereumMainnet}`]: { name: "Ethereum", icon: "/chain-icons/ethereum.svg" },
	// };
	return (
		<div className="bg-black/30 border-2 border-[#FF2D78]/40 rounded-none shadow-[4px_4px_0px_rgba(255,45,120,0.3)] md:max-h-[182px] md:max-w-full space-y-1 text-white flex flex-col md:flex-row items-center justify-between p-4 w-full mx-auto gap-0">
			<AvatarImage image={data?.image} address={data?.address} />
			<div className="md:ml-6 space-y-1 mb-2 flex flex-col h-full">
				<h1 className="text-2xl mt-2 sm:text-3xl font-bold text-gray-100 text-center md:text-start uppercase tracking-wider">
					{data.username}
				</h1>

				<div className="flex w-full max-w-[320px] max-h-[30px] items-center justify-center sm:justify-start gap-1 mt-1 text-sm font-mono text-gray-400 bg-black/40 py-1 border border-[#FF2D78]/30 rounded-none shadow-inner">
					<span className="p-2 truncate">{data.address}</span>
					<CopyButton
						textToCopy={data.address}
						className=" mr-2 text-[#FF2D78]/70 hover:text-[#FF2D78] cursor-pointer flex-shrink-0"
					/>
				</div>
				{data?.totalPoints ? (
					<div className="flex flex-col mt-1">
						<div className="flex justify-between items-center w-full px-0 py-1">
							<div className="flex items-center gap-1">
								<span className="text-sm">Total Points</span>
							</div>
							<p className="font-semibold text-[#FF2D78] text-base">{formatNumber(data.totalPoints, false, true)}</p>
						</div>
						<div className="flex justify-between items-center w-full px-0 py-1">
							<div className="flex items-center gap-1">
								<span className="text-sm">Weekly Points</span>
							</div>
							<p className="font-semibold text-yellow-400  text-base">{formatNumber(data.weeklyPoints, false, true)}</p>
						</div>
					</div>
				) : null}
			</div>

			<div className="h-full flex flex-col md:flex-col w-full space-y-2 place-self-start md:w-fit place-content-center ml-auto">
				<div className="bg-[#FF2D78]/10 text-xs text-[#FF2D78] border border-[#FF2D78]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(255,45,120,0.2)] text-center">
					Tokens Created: <span className="font-bold">{data.tokensCreated}</span>
				</div>
				<div className="bg-[#FF2D78]/10 text-xs text-[#FF2D78] border border-[#FF2D78]/50 px-2 py-1 rounded-none shadow-[2px_2px_0px_rgba(255,45,120,0.2)] text-center">
					Tokens Bought: <span className="font-bold">{data.tokensBought}</span>
				</div>
			</div>
		</div>
	);
}
