"use client";

import { Button } from "./ui/button";
import { claimFees } from "@/lib/api";
import { useState } from "react";
import { Wallet } from "lucide-react";
import type { IToken } from "@autofun/types";
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
		<div className="flex flex-col gap-2 p-3 bg-black/20 border border-[#00FF87]/30 rounded-none">
			<div className="flex items-center gap-2">
				<Wallet className="w-4 h-4 text-[#00FF87]" />
				<span className="text-sm font-medium text-[#00FF87] uppercase">Claim Fees</span>
			</div>
			<p className="text-xs text-gray-400">
				As the token creator, you can claim accumulated fees from trading activity.
			</p>
			<Button
				onClick={handleClaim}
				disabled={isClaiming}
				className="w-full bg-[#00FF87]/10 hover:bg-[#00FF87]/20 text-[#00FF87] border border-[#00FF87]/50 rounded-none"
				size="sm"
			>
				{isClaiming ? "Claiming..." : "Claim Fees"}
			</Button>
		</div>
	);
}
