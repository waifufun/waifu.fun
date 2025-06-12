"use client";
import { FormSection } from "./form-section";
import { UploadCloud } from "lucide-react";
import {
	CoinInfoFields,
	CustomAddressGenerator,
	PreBuySection,
	PoolSelection,
	LaunchButton,
	CustomCurveSection,
	DelayedStartSection,
	TradeLimitSection,
} from "./shared-form-section";

export function ManualCreateForm() {
	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			<FormSection title="Token Image" className="space-y-4" collapsible={false}>
				<div className="w-full h-[240px] bg-black/50 border-2 border-dashed border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:border-[#03FF24] transition-all group">
					<UploadCloud size={48} className="text-[#03FF24]/70 group-hover:text-[#03FF24] mb-2 transition-colors" />
					<p className="text-sm text-gray-300 group-hover:text-white">
						Drag & drop an image or <span className="text-[#03FF24] font-semibold">click to upload</span>
					</p>
					<p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 5MB. Recommended: Square, pixel art.</p>
				</div>
			</FormSection>

			<div className="space-y-6">
				<CoinInfoFields idPrefix="manual" />
				<CustomAddressGenerator idPrefix="manual" />
				<CustomCurveSection />
				<DelayedStartSection />
				<TradeLimitSection />
				<PreBuySection idPrefix="manual" />
				<PoolSelection />
				<LaunchButton />
			</div>
		</div>
	);
}
