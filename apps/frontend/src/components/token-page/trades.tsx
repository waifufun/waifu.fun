import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrades } from "@/lib/api";
import type { IToken, ITrade } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import { formatUsd, shortenAddress } from "@/lib/utils";
import Triangle from "../triangle";
import ChainIndicator from "../chain-indicator";
import { Fragment } from "react";
import AutoRefresher from "../auto-refresher";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@autofun/constants";
import Link from "next/link";
import TimeAgo from "../time-ago";

export default async function Trades({ token }: { token: IToken }) {
	const data = await getTrades({
		chain: token.chain,
		chainId: token.chainId,
		contractAddress: token.contractAddress,
	});

	if (!data || data?.length === 0) {
		return (
			<div className="p-4 py-8 text-center w-full text-sm text-autofun-text-secondary">
				There are currently no trades.
			</div>
		);
	}

	return (
		<Fragment>
			<AutoRefresher interval={10_000} />
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
						<TableRow key={trade.txId} className="animate-shake animate-once animate-duration-200 animate-ease-linear">
							<TableCell className="font-medium">{trade.address ? shortenAddress(trade?.address) : "-"}</TableCell>
							<TableCell>
								<Triangle direction={trade?.type === "buy" ? "up" : "down"} />
							</TableCell>
							<TableCell>
								<div className="flex items-center gap-2">
									<ChainIndicator chain={token.chain} chainId={token.chainId} className="size-5" />
									{new Intl.NumberFormat("en-US", {
										maximumFractionDigits: 3,
									}).format(Number(trade.fromAmount))}{" "}
									{trade.fromToken}
								</div>
							</TableCell>
							<TableCell>{trade?.usdValue ? formatUsd(Number(trade?.usdValue)) : "-"}</TableCell>
							<TableCell>
								{new Intl.NumberFormat("en-US", {
									maximumFractionDigits: 3,
								}).format(Number(trade.toAmount))}
							</TableCell>
							<TableCell className="text-right">
								{trade?.timestamp ? <TimeAgo date={trade?.timestamp} /> : "-"}
							</TableCell>
							<TableCell>
								<Link
									href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain][token.chainId]}/tx/${trade.txId}`}
									target="_blank"
								>
									<ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
								</Link>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Fragment>
	);
}
