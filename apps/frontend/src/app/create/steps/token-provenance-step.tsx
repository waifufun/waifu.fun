"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/ui/create-token/form-section";
import {
	CustomAddressGenerator,
	CustomCurveSection,
	PoolSelection,
} from "@/components/ui/create-token/shared-form-section";
import { useDraft } from "../draft-context";
import { cn } from "@/lib/utils";

const formElementBaseClass =
	"bg-black border-2 border-[#00FF87]/60 placeholder-gray-500 text-sm focus:border-[#00FF87] focus:ring-1 focus:ring-[#00FF87] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(0,255,135,0.25)]";
const formLabelBaseClass = "text-xs text-gray-400 uppercase tracking-wider font-semibold";

/* ------------------------------------------------------------------ */
/*  Import CA input                                                    */
/* ------------------------------------------------------------------ */

function ImportAddressInput() {
	const { draft, setImportAddress } = useDraft();

	const isValidSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(draft.importContractAddress);

	return (
		<FormSection title="Contract Address">
			<div className="space-y-3">
				<div>
					<Label htmlFor="importCA" className={formLabelBaseClass}>
						Solana Contract Address <span className="text-red-500">*</span>
					</Label>
					<Input
						type="text"
						id="importCA"
						placeholder="Enter the token's Solana contract address"
						value={draft.importContractAddress}
						onChange={(e) => setImportAddress(e.target.value.trim())}
						className={cn(
							formElementBaseClass,
							"mt-1 h-11 font-mono",
							draft.importContractAddress &&
								!isValidSolanaAddress &&
								"border-red-500 focus:border-red-500",
						)}
					/>
					{draft.importContractAddress && !isValidSolanaAddress && (
						<p className="text-red-500 text-xs mt-1">Invalid Solana address format</p>
					)}
				</div>

				{/* TODO: When backend provides token-lookup-by-CA, show resolved token info here */}
				{isValidSolanaAddress && (
					<div className="p-3 bg-[#00FF87]/5 border border-[#00FF87]/20 rounded-none">
						<p className="text-xs text-gray-400">
							Address:{" "}
							<span className="text-[#00FF87] font-mono text-[11px] break-all">
								{draft.importContractAddress}
							</span>
						</p>
						<p className="text-[10px] text-gray-500 mt-1">
							⏳ Token details will be verified on-chain during import.
						</p>
					</div>
				)}
			</div>
		</FormSection>
	);
}

/* ------------------------------------------------------------------ */
/*  Main step                                                          */
/* ------------------------------------------------------------------ */

export function TokenProvenanceStep() {
	const { draft } = useDraft();
	const isImport = draft.mode === "import";

	return (
		<div className="space-y-6">
			<div className="mb-2">
				<h2 className="text-lg font-bold text-[#00FF87] uppercase tracking-wider">
					Token &amp; Provenance
				</h2>
				<p className="text-xs text-gray-500 mt-1">
					{isImport
						? "Provide the contract address of the token you want to import."
						: "Configure your token's on-chain address, bonding curve, and liquidity pool."}
				</p>
			</div>

			{isImport ? (
				<ImportAddressInput />
			) : (
				<div className="space-y-6">
					<CustomAddressGenerator idPrefix="wizard" collapsible={false} defaultOpen={true} />
					<CustomCurveSection collapsible={false} defaultOpen={true} />
					<PoolSelection collapsible={false} defaultOpen={true} />
				</div>
			)}
		</div>
	);
}
