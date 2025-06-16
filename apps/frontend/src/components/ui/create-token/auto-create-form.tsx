"use client";
import Image from "next/image";
import { Textarea } from "@/components/ui/create-token/textarea";
import { Button } from "@/components/ui/button";
import { FormSection } from "./form-section";
import { Wand2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
import { CoinInfoFields, CustomAddressGenerator, PreBuySection, LaunchButton } from "./shared-form-section";
import { useEffect } from "react";

const AIImageWithPlaceHolder = ({ href }: { href: string | undefined }) => {
	if (!href) {
		return (
			<div className="w-full h-full bg-black/50 border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex items-center justify-center">
				<p className="text-gray-500">No Image</p>
			</div>
		);
	}
	return (
		<div className="w-full h-full relative rounded-none overflow-hidden">
			<Image alt="Generated Image" src={href} fill className="object-contain p-2 pixelated-image-render" />
		</div>
	);
};

const AiImageLoading = () => {
	return (
		<div className="w-full h-full bg-black/50 border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex items-center justify-center">
			<div className="flex items-center gap-2">
				<RefreshCw size={16} className="animate-spin text-[#03FF24]" />
				<p className="text-[#03FF24]">Generating...</p>
			</div>
		</div>
	);
};

function AutoCreateForm() {
	const { registerForm, generateToken, watchValue, previousImages, isGeneratingImage, changeMainImage } = usePrompt();

	const formElementBaseClass =
		"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";

	const prompt = watchValue("prompt");

	// Get the next 3 images for thumbnails
	const startingIndex = isGeneratingImage ? 0 : 1;
	const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);

	// Fill with undefined if we don't have 3 images
	if (nextImages.length < 3) {
		const diff = 3 - nextImages.length;
		for (let i = 0; i < diff; i++) {
			nextImages.push(undefined);
		}
	}

	const handleGenerateImage = () => {
		if (!prompt) {
			generateToken();
		} else {
			generateToken(prompt.toString().length > 0 ? prompt.toString() : "");
		}
	};

	// ignore biome
	useEffect(() => {
		generateToken();
	}, [generateToken]);

	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
				<div className="relative">
					<Wand2 size={16} className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" />
					<Textarea
						placeholder="A grumpy, older man in a Hawaiian shirt, wildly ripping open a vintage tech package with an ecstatic yet furious expression.  Surrounded by styrofoam peanuts and packing tape.  Highly detailed, 8k resolution, trending art style, vibrant colors, dramatic lighting."
						className={cn(formElementBaseClass, "pl-10 pr-3 py-3 min-h-[80px] resize-y tracking-wider")}
						rows={3}
						{...registerForm("prompt")}
					/>
				</div>

				{/* Main AI Generated Image */}
				<div className="w-full h-[240px]">
					{isGeneratingImage ? <AiImageLoading /> : <AIImageWithPlaceHolder href={previousImages[0]} />}
				</div>

				{/* Thumbnail Images */}
				<div className="grid grid-cols-3 gap-3">
					{nextImages.map((image, index) => (
						<button
							type="button"
							onClick={() => {
								if (image) {
									changeMainImage(index + 1);
								}
							}}
							key={image}
							className="aspect-square bg-black/50 border-2 border-[#03FF24]/30 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] hover:border-[#03FF24] cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={!image}
						>
							<AIImageWithPlaceHolder href={image} />
						</button>
					))}
				</div>

				<Button
					className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider"
					onClick={handleGenerateImage}
					disabled={isGeneratingImage}
				>
					{isGeneratingImage ? (
						<>
							<RefreshCw size={16} className="mr-2 animate-spin" /> Generating...
						</>
					) : (
						<>
							<RefreshCw size={16} className="mr-2" /> Generate Image
						</>
					)}
				</Button>
			</FormSection>

			<div className="space-y-6">
				<CoinInfoFields idPrefix="auto" />
				<CustomAddressGenerator idPrefix="auto" />
				<PreBuySection idPrefix="auto" />
				<LaunchButton />
			</div>
		</div>
	);
}

export default function WrappedComponent() {
	return (
		<PromptProvider>
			<AutoCreateForm />
		</PromptProvider>
	);
}
