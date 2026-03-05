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
	return (
		<div className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm md:max-h-[182px] md:max-w-full space-y-1 text-white flex flex-col md:flex-row items-center justify-between p-4 w-full mx-auto gap-0">
			<AvatarImage image={data?.image} address={data?.address} />
			<div className="md:ml-6 space-y-1 mb-2 flex flex-col h-full">
				<h1 className="text-2xl mt-2 sm:text-3xl font-bold text-[#e4e4e7] text-center md:text-start">
					{data.username}
				</h1>

				<div className="flex w-full max-w-[320px] max-h-[30px] items-center justify-center sm:justify-start gap-1 mt-1 text-sm font-mono text-[#a1a1aa] bg-[rgba(17,17,20,0.7)] py-1 border border-[rgba(255,255,255,0.06)] rounded-sm">
					<span className="p-2 truncate">{data.address}</span>
					<CopyButton
						textToCopy={data.address}
						className="mr-2 text-[#71717a] hover:text-[#00ff87] cursor-pointer flex-shrink-0"
					/>
				</div>
				{data?.totalPoints ? (
					<div className="flex flex-col mt-1">
						<div className="flex justify-between items-center w-full px-0 py-1">
							<div className="flex items-center gap-1">
								<span className="text-sm text-[#a1a1aa]">Total Points</span>
							</div>
							<p className="font-semibold text-[#00ff87] text-base">{formatNumber(data.totalPoints, false, true)}</p>
						</div>
						<div className="flex justify-between items-center w-full px-0 py-1">
							<div className="flex items-center gap-1">
								<span className="text-sm text-[#a1a1aa]">Weekly Points</span>
							</div>
							<p className="font-semibold text-yellow-400 text-base">{formatNumber(data.weeklyPoints, false, true)}</p>
						</div>
					</div>
				) : null}
			</div>

			<div className="h-full flex flex-col md:flex-col w-full space-y-2 place-self-start md:w-fit place-content-center ml-auto">
				<div className="bg-[rgba(0,255,135,0.06)] text-xs text-[#00ff87] border border-[rgba(0,255,135,0.12)] px-2.5 py-1 rounded-sm text-center">
					Tokens Created: <span className="font-bold">{data.tokensCreated}</span>
				</div>
				<div className="bg-[rgba(0,255,135,0.06)] text-xs text-[#00ff87] border border-[rgba(0,255,135,0.12)] px-2.5 py-1 rounded-sm text-center">
					Tokens Bought: <span className="font-bold">{data.tokensBought}</span>
				</div>
			</div>
		</div>
	);
}
