import type { AddressLike } from "@waifufun/types";
import { Badge } from "../ui/badge";

export default function HolderLabels({
	address,
	isCreator,
	isBondingCurve,
}: { address: AddressLike; isBondingCurve?: boolean; isCreator?: boolean }) {
	const burnAddresses = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"];
	return (
		<div className="flex items-center gap-2">
			{burnAddresses?.includes(address.toLowerCase()) ? <Badge>🔥 Burn</Badge> : null}
			{isCreator ? <Badge>Creator</Badge> : null}
			{isBondingCurve ? <Badge>Bonding Curve</Badge> : null}
		</div>
	);
}
