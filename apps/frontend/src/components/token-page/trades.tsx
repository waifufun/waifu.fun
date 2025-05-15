import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrades } from "@/lib/api";
import type { IToken, ITrade } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import { formatUsd, fromNow, shortenAddress } from "@/lib/utils";
import Triangle from "../triangle";

export default async function Trades({ token }: { token: IToken }) {
	const data = await getTrades({
		chain: token.chain,
		chainId: token.chainId,
		contractAddress: token.contractAddress,
	});

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[100px]">Account</TableHead>
					<TableHead className="text-center">Type</TableHead>
					<TableHead>Native</TableHead>
					<TableHead>USD</TableHead>
					<TableHead>Tokens</TableHead>
					<TableHead className="w-12 text-right">Date</TableHead>
					<TableHead className="w-5 text-right" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((trade: ITrade) => (
					<TableRow key={trade.txId}>
						<TableCell className="font-medium flex items-center gap-2">
							{trade.address ? shortenAddress(trade?.address) : "-"}
						</TableCell>
						<TableCell>
							<Triangle color={trade?.type === "buy" ? "bg-[#03FF24] m-auto" : "bg-[#EF5350] rotate-180 m-auto"} />
						</TableCell>
						<TableCell>
							{trade.fromAmount} {trade.fromToken}
						</TableCell>
						<TableCell>{trade?.usdValue ? formatUsd(Number(trade?.usdValue)) : "-"}</TableCell>
						<TableCell>{trade.toAmount}</TableCell>
						<TableCell className="text-right">{trade?.timestamp ? fromNow(trade?.timestamp) : "-"}</TableCell>
						<TableCell>
							<ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
