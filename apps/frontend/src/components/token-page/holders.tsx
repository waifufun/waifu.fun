import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import type { IHolder, IToken } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import HolderLabels from "./holder-labels";
import { abbreviateNumber, shortenAddress } from "@/lib/utils";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import Link from "next/link";
import { cn } from "@/lib/utils";

const headerClass = "text-[10px] font-mono uppercase tracking-wider text-[#71717a]";

export default async function Holders({ token }: { token: IToken }) {
	try {
		const data = await getHolders({
			chain: token.chain,
			chainId: token.chainId,
			contractAddress: token.contractAddress,
		});

		if (!data || data?.length === 0) {
			return (
				<div className="p-4 py-8 text-center w-full text-sm text-[#a1a1aa]">
					There are currently no holders.
				</div>
			);
		}

		return (
			<Table id="holders">
				<TableHeader>
					<TableRow>
						<TableHead className={cn(headerClass, "w-[25px]")}>#</TableHead>
						<TableHead className={cn(headerClass, "w-[100px]")}>address</TableHead>
						<TableHead className={cn(headerClass, "text-right")}>amount</TableHead>
						<TableHead className={cn(headerClass, "w-[200px] text-right")}>share</TableHead>
						<TableHead className="w-5 text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((holder: IHolder, rank: number) => (
						<TableRow key={holder.address}>
							<TableCell className="text-[#71717a] font-mono text-xs">{rank + 1}</TableCell>
							<TableCell>
								<div className="flex items-center gap-2 font-medium">
									<Link
										href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain][token.chainId]}/address/${holder.address}`}
										target="_blank"
										className="hover:text-[#00ff87] transition-colors"
									>
										{shortenAddress(holder.address)}
									</Link>
									<HolderLabels
										address={holder.address}
										isBondingCurve={holder.isBondingCurve || false}
										isCreator={holder.isCreator || false}
									/>
								</div>
							</TableCell>
							<TableCell className="text-right font-mono text-sm">
								{abbreviateNumber(Number(holder.balanceFormatted), true)}
							</TableCell>
							<TableCell className="text-right">
								<div className="flex items-center justify-end gap-2">
									<div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#1f1f23]">
										<div
											className="h-full rounded-full bg-[#00ff87]"
											style={{ width: `${Math.min(Number(holder.percentage), 100)}%` }}
										/>
									</div>
									<span className="font-mono text-xs text-[#a1a1aa] w-12 text-right">
										{holder.percentage}%
									</span>
								</div>
							</TableCell>
							<TableCell>
								<Link
									href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain][token.chainId]}/address/${holder.address}`}
									target="_blank"
								>
									<ExternalLink className="ml-auto size-4 text-[#a1a1aa]" />
								</Link>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	} catch (error) {
		return (
			<div className="p-4 py-8 text-center w-full text-sm text-[#a1a1aa]">
				Unable to load holder data at this time.
			</div>
		);
	}
}
