"use client";

import { useTranslation } from "@/contexts/locale-context";
import { claimFees } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import { Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";

interface ClaimFeesProps {
	token: IToken;
}

export default function ClaimFees({ token }: ClaimFeesProps) {
	const { t } = useTranslation();
	const [isClaiming, setIsClaiming] = useState(false);

	const handleClaim = async () => {
		try {
			setIsClaiming(true);
			await claimFees({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			});
			toast.success(t("claim.fees.successToast"));
		} catch (error) {
			console.error("Failed to claim fees:", error);
			toast.error(t("claim.fees.failureToast"));
		} finally {
			setIsClaiming(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 p-3 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm">
			<div className="flex items-center gap-2">
				<Wallet className="w-4 h-4 text-[#00ff87]" />
				<span className="text-sm font-medium text-[#00ff87] uppercase">{t("claim.fees.label")}</span>
			</div>
			<p className="text-xs text-gray-400">{t("claim.fees.body")}</p>
			<Button
				onClick={handleClaim}
				disabled={isClaiming}
				className="w-full bg-[#00ff87]/10 hover:bg-[#00ff87]/20 text-[#00ff87] border border-[#00ff87]/50 rounded-sm"
				size="sm"
			>
				{isClaiming ? t("claim.fees.claimingCta") : t("claim.fees.claimCta")}
			</Button>
		</div>
	);
}
