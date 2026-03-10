"use client";

import { FormSection } from "@/components/ui/create-token/form-section";
import { PreBuySection } from "@/components/ui/create-token/shared-form-section";
import { useDraft } from "../draft-context";
import useAddress from "@/hooks/use-address";
import useBalance from "@/hooks/use-balance";
import { Wallet } from "lucide-react";

export function OwnerBillingStep() {
	const { draft } = useDraft();
	const isImport = draft.mode === "import";
	const address = useAddress();
	const balanceQuery = useBalance({ chain: "solana", address });
	const balance = balanceQuery?.data || 0;

	return (
		<div className="space-y-6">
			<div className="mb-2">
				<h2 className="text-lg font-bold text-[#00FF87] uppercase tracking-wider">
					Owner &amp; Billing
				</h2>
				<p className="text-xs text-gray-500 mt-1">
					{isImport
						? "Review ownership and billing details for your imported token."
						: "Set your initial token purchase and review wallet details."}
				</p>
			</div>

			{/* Wallet summary – shown for both modes */}
			<FormSection title="Connected Wallet">
				<div className="space-y-3">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-[#00FF87]/10 border border-[#00FF87]/30 rounded-none flex items-center justify-center">
							<Wallet size={18} className="text-[#00FF87]" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Address</p>
							<p className="text-sm text-gray-200 font-mono truncate">
								{address || "Not connected"}
							</p>
						</div>
					</div>
					<div className="flex items-center justify-between p-2 bg-black/40 border border-[#00FF87]/20 rounded-none">
						<span className="text-xs text-gray-400">Balance</span>
						<span className="text-sm font-bold text-[#00FF87]">{balance.toFixed(4)} SOL</span>
					</div>
					{!address && (
						<p className="text-xs text-yellow-400">
							⚠️ Please connect your wallet to proceed.
						</p>
					)}
				</div>
			</FormSection>

			{isImport ? (
				<FormSection title="Billing">
					{/* TODO: When backend exposes billing/subscription info for imported tokens,
					    wire fee display and payment method here.
					    For now this is an integration seam. */}
					<div className="space-y-3">
						<div className="p-4 bg-[#00FF87]/5 border border-[#00FF87]/20 rounded-none">
							<p className="text-xs text-gray-400 leading-relaxed">
								Importing a token is free. Future agent services may require a
								subscription — billing details will appear here when available.
							</p>
						</div>
						<div className="text-[10px] text-gray-600 uppercase tracking-wider">
							Integration seam — billing routes pending
						</div>
					</div>
				</FormSection>
			) : (
				<PreBuySection idPrefix="wizard" collapsible={false} defaultOpen={true} />
			)}
		</div>
	);
}
