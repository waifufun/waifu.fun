"use client";

import { Button } from "./ui/button";
import { claimFees } from "@/lib/api";
import { useState } from "react";
import { Wallet } from "lucide-react";
import type { IToken } from "@waifufun/types";
import { toast } from "sonner";

interface ClaimFeesProps {
	token: IToken;
}

export default function ClaimFees({ token }: ClaimFeesProps) {
	const [isClaiming, setIsClaiming] = useState(false);

	const handleClaim = async () => {
		try {
			setIsClaiming(true);
			await claimFees({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			});
			toast.success("Fees claimed successfully!");
		} catch (error) {
			console.error("Failed to claim fees:", error);
			toast.error("Failed to claim fees. Please try again later.");
		} finally {
			setIsClaiming(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 p-3 bg-black/20 border border-[#E8762D]/30 rounded-none">
			<div className="flex items-center gap-2">
				<Wallet className="w-4 h-4 text-[#E8762D]" />
				<span className="text-sm font-medium text-[#E8762D] uppercase">Claim Fees</span>
			</div>
			<p className="text-xs text-gray-400">
				As the token creator, you can claim accumulated fees from trading activity.
			</p>
			<Button
				onClick={handleClaim}
				disabled={isClaiming}
				className="w-full bg-[#E8762D]/10 hover:bg-[#E8762D]/20 text-[#E8762D] border border-[#E8762D]/50 rounded-none"
				size="sm"
			>
				{isClaiming ? "Claiming..." : "Claim Fees"}
			</Button>
		</div>
	);
}
