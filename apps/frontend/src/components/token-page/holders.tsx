import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import type { IHolder, IToken } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import HolderLabels from "./holder-labels";

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
					<TableHead className="w-[100px]">Account</TableHead>
					<TableHead className="w-[75px] text-right">Amount</TableHead>
					<TableHead className="w-[75px] text-right">Percentage</TableHead>
					<TableHead className="w-5 text-right" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((holder: IHolder) => (
					<TableRow key={holder.address}>
						<TableCell className="font-medium flex items-center gap-2">
							{holder.address} <HolderLabels address={holder.address} />
						</TableCell>
						<TableCell className="text-right">{holder.balanceFormatted}</TableCell>
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
