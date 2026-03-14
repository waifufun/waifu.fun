import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import { abbreviateNumber, cn, shortenAddress } from "@/lib/utils";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import type { IHolder, IToken } from "@waifufun/types";
import { ExternalLink, Info, Users } from "lucide-react";
import Link from "next/link";
import {
	HOLDER_DATA_UNAVAILABLE_DESCRIPTION,
	HOLDER_DATA_UNAVAILABLE_TITLE,
	getHolderCountDisplay,
	hasAggregateHolderCount,
	isHolderDataIndexed,
} from "./holder-data-state";
import HolderLabels from "./holder-labels";

const headerClass = "text-[10px] font-mono uppercase tracking-wider text-[#71717a]";

function HoldersUnavailableState({ token }: { token: IToken }) {
	const hasAggregateHolders = hasAggregateHolderCount(token);

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 sm:p-5">
			<div className="flex items-center gap-2 mb-3 min-w-0">
				<Users className="size-4 text-[#71717a] shrink-0" />
				<span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">holders</span>
				<span className="rounded-sm border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#71717a]">
					leaderboard unavailable
				</span>
			</div>
			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] p-4">
				<div className="flex items-center gap-2 text-[#e4e4e7] font-mono lowercase">
					<Info className="size-4 text-[#00ff87] shrink-0" />
					<span>{HOLDER_DATA_UNAVAILABLE_TITLE}</span>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">{HOLDER_DATA_UNAVAILABLE_DESCRIPTION}</p>
				{hasAggregateHolders ? (
					<div className="mt-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-2.5">
						<div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#71717a]">aggregate holders</div>
						<div className="mt-1 font-mono text-sm text-[#e4e4e7]">{getHolderCountDisplay(token)}</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

export default async function Holders({ token }: { token: IToken }) {
	if (!isHolderDataIndexed(token)) {
		return <HoldersUnavailableState token={token} />;
	}

	try {
		const data = await getHolders({
			chain: token.chain,
			chainId: token.chainId,
			contractAddress: token.contractAddress,
		});

		if (!data || data.length === 0) {
			return <div className="p-4 py-8 text-center w-full text-sm text-[#a1a1aa]">no indexed holders yet.</div>;
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
									<span className="font-mono text-xs text-[#a1a1aa] w-12 text-right">{holder.percentage}%</span>
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
	} catch (_error) {
		return (
			<div className="p-4 py-8 text-center w-full text-sm text-[#a1a1aa]">
				holder indexing temporarily unavailable.
			</div>
		);
	}
}
