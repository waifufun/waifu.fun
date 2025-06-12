"use client";
import Image from "next/image";
import { Textarea } from "@/components/ui/create-token/textarea";
import { Button } from "@/components/ui/button";
import { FormSection } from "./form-section";
import { Wand2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	CoinInfoFields,
	CustomAddressGenerator,
	PreBuySection,
	LaunchButton,
	// Removed: CustomCurveSection,
	// Removed: DelayedStartSection,
	// Removed: TradeLimitSection,
	// Removed: PoolSelection,
} from "./shared-form-section";

export function AutoCreateForm() {
	const formElementBaseClass =
		"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";

	const aiImages = [
		{ src: "/ai-thumbnail-1.png", alt: "AI Generated Thumbnail 1" },
		{ src: "/ai-thumbnail-2.png", alt: "AI Generated Thumbnail 2" },
		{ src: "/ai-thumbnail-3.png", alt: "AI Generated Thumbnail 3" },
	];

	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
				<div className="relative">
					<Wand2 size={16} className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" />
					<Textarea
						placeholder="Type a Prompt..."
						className={cn(formElementBaseClass, "pl-10 pr-3 py-3 min-h-[80px] resize-y uppercase tracking-wider")}
						rows={3}
					/>
				</div>
				<div className="w-full h-[240px] bg-black/50 border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex items-center justify-center overflow-hidden">
					<Image
						src="/joker-placeholder.png"
						alt="AI Generated Token Image"
						width={400}
						height={400}
						className="object-contain w-full h-full p-2 pixelated-image-render"
					/>
				</div>
				<div className="grid grid-cols-3 gap-3">
					{aiImages.map((img, idx) => (
						<div
							key={idx}
							className="aspect-square bg-black/50 border-2 border-[#03FF24]/30 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] hover:border-[#03FF24] cursor-pointer transition-all"
						>
							<Image
								src={img.src || "/placeholder.svg?width=150&height=150&query=ai+thumbnail"}
								alt={img.alt}
								width={150}
								height={150}
								className="object-cover w-full h-full pixelated-image-render"
							/>
						</div>
					))}
				</div>
				<Button className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider">
					<RefreshCw size={16} className="mr-2" /> Generate Image
				</Button>
			</FormSection>

			<div className="space-y-6">
				<CoinInfoFields idPrefix="auto" />
				<CustomAddressGenerator idPrefix="auto" />
				{/* CustomCurveSection removed */}
				{/* DelayedStartSection removed */}
				{/* TradeLimitSection removed */}
				<PreBuySection idPrefix="auto" />
				{/* PoolSelection removed */}
				<LaunchButton />
			</div>
		</div>
	);
}
