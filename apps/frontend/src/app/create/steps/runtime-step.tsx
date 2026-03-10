"use client";

import { FormSection } from "@/components/ui/create-token/form-section";
import {
	DelayedStartSection,
	TradeLimitSection,
} from "@/components/ui/create-token/shared-form-section";
import { useDraft } from "../draft-context";

export function RuntimeStep() {
	const { draft } = useDraft();
	const isImport = draft.mode === "import";

	return (
		<div className="space-y-6">
			<div className="mb-2">
				<h2 className="text-lg font-bold text-[#00FF87] uppercase tracking-wider">Runtime</h2>
				<p className="text-xs text-gray-500 mt-1">
					{isImport
						? "Configure runtime settings for your imported token's agent."
						: "Set launch timing and trade protections for your token."}
				</p>
			</div>

			{isImport ? (
				<FormSection title="Agent Runtime">
					{/* TODO: When backend draft routes expose runtime config for imported tokens,
					    wire agent personality / model / runtime settings here.
					    For now this is an integration seam. */}
					<div className="space-y-3">
						<div className="p-4 bg-[#00FF87]/5 border border-[#00FF87]/20 rounded-none">
							<p className="text-xs text-gray-400 leading-relaxed">
								Runtime configuration for imported tokens is coming soon. After
								import, you&apos;ll be able to configure your agent&apos;s
								personality, model, and on-chain behavior from the token page.
							</p>
						</div>
						<div className="text-[10px] text-gray-600 uppercase tracking-wider">
							Integration seam — backend draft routes pending
						</div>
					</div>
				</FormSection>
			) : (
				<div className="space-y-6">
					<DelayedStartSection collapsible={false} defaultOpen={true} />
					<TradeLimitSection collapsible={false} defaultOpen={true} />
				</div>
			)}
		</div>
	);
}
