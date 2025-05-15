import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import type { IHolder, IToken } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import HolderLabels from "./holder-labels";
import { abbreviateNumber, getPercentageOfTotal, shortenAddress } from "@/lib/utils";
import { formatUnits } from "viem";

const Progressbar = ({ value, max }: { value: number; max: number }) => {
	const width = getPercentageOfTotal(value, max);
	return (
		<div className="h-3 w-full bg-autofun-background-action-disabled relative">
			<div
				className="h-3 bg-autofun-background-action-highlight"
				style={{
					width: `${width}%`,
				}}
			/>
		</div>
	);
};

export default async function Holders({ token }: { token: IToken }) {
	const data = await getHolders({
		chain: token.chain,
		chainId: token.chainId,
		contractAddress: token.contractAddress,
	});
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[25px]">Rank</TableHead>
					<TableHead className="w-[100px]">Account</TableHead>
					<TableHead className="max-w-xl">Amount</TableHead>
					<TableHead className="w-[75px] text-right">Percentage</TableHead>
					<TableHead className="w-5 text-right" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((holder: IHolder, rank: number) => (
					<TableRow key={holder.address}>
						<TableCell className="text-autofun-text-secondary font-medium">#{rank + 1}</TableCell>
						<TableCell className="font-medium flex items-center gap-2">
							{shortenAddress(holder.address)} <HolderLabels address={holder.address} />
						</TableCell>
						<TableCell>
							<div className="flex items-center gap-2">
								<div className="w-16 text-right">{abbreviateNumber(Number(holder.balanceFormatted), true)}</div>
								<Progressbar
									value={Number(holder.balanceFormatted)}
									max={Number(formatUnits(BigInt(token.totalSupply), token.decimals))}
								/>
								<div className="w-16 text-left">
									{abbreviateNumber(Number(formatUnits(BigInt(token.totalSupply), token.decimals)))}
								</div>
							</div>
						</TableCell>
						<TableCell className="text-right">{holder.percentage}%</TableCell>
						<TableCell>
							<ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
