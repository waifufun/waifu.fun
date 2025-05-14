import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHolders } from "@/lib/api";
import type { IHolder, IToken } from "@autofun/types";
import { ExternalLink } from "lucide-react";
import HolderLabels from "./holder-labels";

const invoices = [
	{
		invoice: "INV001",
		paymentStatus: "Paid",
		totalAmount: "$250.00",
		paymentMethod: "Credit Card",
	},
	{
		invoice: "INV002",
		paymentStatus: "Pending",
		totalAmount: "$150.00",
		paymentMethod: "PayPal",
	},
	{
		invoice: "INV003",
		paymentStatus: "Unpaid",
		totalAmount: "$350.00",
		paymentMethod: "Bank Transfer",
	},
	{
		invoice: "INV004",
		paymentStatus: "Paid",
		totalAmount: "$450.00",
		paymentMethod: "Credit Card",
	},
	{
		invoice: "INV005",
		paymentStatus: "Paid",
		totalAmount: "$550.00",
		paymentMethod: "PayPal",
	},
	{
		invoice: "INV006",
		paymentStatus: "Pending",
		totalAmount: "$200.00",
		paymentMethod: "Bank Transfer",
	},
	{
		invoice: "INV007",
		paymentStatus: "Unpaid",
		totalAmount: "$300.00",
		paymentMethod: "Credit Card",
	},
];

export default async function Holders({ token }: { token: IToken }) {
	const data = await getHolders({ chain: token.chain, chainId: token.chainId, contractAddress: token.contractAddress });
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[100px]">Account</TableHead>
					<TableHead className="w-[75px] text-right">Amount</TableHead>
					<TableHead className="w-[75px] text-right">Percentage</TableHead>
					<TableHead className="w-[25px]" />
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
						<TableCell className="text-right">
							<ExternalLink className="size-4 text-autofun-icon-secondary" />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
