import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import type { IHolder, IToken } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import HolderLabels from "./holder-labels";
import { abbreviateNumber, shortenAddress } from "@/lib/utils";
import { formatUnits } from "viem";
import Progressbar from "../progressbar";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@autofun/constants";
import Link from "next/link";

export default async function Holders({ token }: { token: IToken }) {
	try {
		const data = await getHolders({
			chain: token.chain,
			chainId: token.chainId,
			contractAddress: token.contractAddress,
		});

		if (!data || data?.length === 0) {
			return (
				<div className="p-4 py-8 text-center w-full text-sm text-autofun-text-secondary">
					There are currently no holders.
				</div>
			);
		}

		return (
			<Table id="holders">
				<TableHeader>
					<TableRow>
						<TableHead className="w-[25px]">Rank</TableHead>
						<TableHead className="w-[100px]">Account</TableHead>
						<TableHead className="text-center">Amount</TableHead>
						<TableHead className="w-[250px] text-right">Percentage</TableHead>
						<TableHead className="w-5 text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((holder: IHolder, rank: number) => (
						<TableRow key={holder.address}>
							<TableCell className="text-autofun-text-secondary font-medium">#{rank + 1}</TableCell>
							<TableCell>
								<div className="flex items-center gap-2 font-medium">
									{shortenAddress(holder.address)} <HolderLabels address={holder.address} />
								</div>
							</TableCell>
							<TableCell className="text-center">
								<div className="flex items-center justify-center gap-2 w-full mx-auto">
									<div className="w-16 text-right">{abbreviateNumber(Number(holder.balanceFormatted), true)}</div>
									<div className="w-32 lg:w-full">
										<Progressbar
											value={Number(holder.balanceFormatted)}
											max={Number(formatUnits(BigInt(token.totalSupply), token.decimals))}
										/>
									</div>
									<div className="w-16 text-left">
										{abbreviateNumber(Number(formatUnits(BigInt(token.totalSupply), token.decimals)), true)}
									</div>
								</div>
							</TableCell>
							<TableCell className="text-right">{holder.percentage}%</TableCell>
							<TableCell>
								<Link
									href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain][token.chainId]}/${token?.chain === "solana" ? "account" : "address"}account/${holder.address}`}
									target="blank"
								>
									<ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
								</Link>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	} catch (error) {
		return (
			<div className="p-4 py-8 text-center w-full text-sm text-autofun-text-secondary">
				Unable to load holder data at this time.
			</div>
		);
	}
}
