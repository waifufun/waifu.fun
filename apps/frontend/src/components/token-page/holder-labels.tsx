"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { AddressLike } from "@waifufun/types";
import { Badge } from "../ui/badge";

export default function HolderLabels({
	address,
	isCreator,
	isBondingCurve,
}: { address: AddressLike; isBondingCurve?: boolean; isCreator?: boolean }) {
	const { t } = useTranslation();
	const burnAddresses = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"];
	return (
		<div className="flex items-center gap-2">
			{burnAddresses?.includes(address.toLowerCase()) ? <Badge>{t("token.holderLabels.burn")}</Badge> : null}
			{isCreator ? <Badge>{t("token.holderLabels.creator")}</Badge> : null}
			{isBondingCurve ? <Badge>{t("token.holderLabels.bondingCurve")}</Badge> : null}
		</div>
	);
}
