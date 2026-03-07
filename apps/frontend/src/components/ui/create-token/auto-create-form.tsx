"use client";
import Image from "next/image";
import { TerminalTextarea } from "@/components/ui/create-token/terminal-textarea";
import { Button } from "@/components/ui/button";
import { FormSection } from "./form-section";
import { RefreshCw, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { CoinInfoFields, CustomAddressGenerator, PreBuySection, LaunchButton } from "./shared-form-section";
import { useEffect, useState } from "react";

const ImageSkeleton = ({ isGenerating }: { isGenerating: boolean }) => (
	<div className="w-full h-full bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col items-center justify-center relative overflow-hidden">
		{isGenerating ? (
			<>
				<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.05)] to-transparent animate-shimmer" />
				<div className="relative">
					<p className="text-[#00ff87] font-mono text-sm uppercase tracking-widest animate-glitch">generating</p>
					<div className="flex gap-1 mt-2 justify-center">
						<span className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
						<span className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
						<span className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
					</div>
				</div>
			</>
		) : (
			<div className="flex flex-col items-center gap-2">
				<Sparkles size={24} className="text-[#52525b]" />
				<p className="text-[#52525b] text-sm font-mono">no image</p>
			</div>
		)}
	</div>
);

const ThumbnailSkeleton = ({ isGenerating }: { isGenerating: boolean }) => (
	<div className="w-full h-full bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.04)] rounded-sm flex items-center justify-center relative overflow-hidden">
		{isGenerating && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.03)] to-transparent animate-shimmer" />}
	</div>
);

function AutoCreateForm() {
	const { registerForm, generateToken, watchValue, previousImages, isGeneratingMedia, changeMainImage } = usePrompt();
	const [isClient, setIsClient] = useState(false);
	const prompt = watchValue("prompt");
	
	const startingIndex = isGeneratingMedia ? 0 : 1;
	const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);
	while (nextImages.length < 3) nextImages.push(undefined);

	const handleGenerateImage = () => generateToken({ mediaType: "image", prompt: prompt?.toString() || "" });
	const handleSelectThumbnail = (index: number) => changeMainImage(index);

	useEffect(() => { setIsClient(true); }, []);

	if (!isClient) {
		return (
			<div className="grid md:grid-cols-2 gap-6 md:items-start">
				<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
					<TerminalTextarea placeholder="describe your token's vibe..." maxLength={3000} disabled />
					<div className="w-full aspect-[4/3] min-h-[200px] max-h-[400px]"><ImageSkeleton isGenerating={false} /></div>
					<div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={`sk-${i}`} className="aspect-square"><ThumbnailSkeleton isGenerating={false} /></div>)}</div>
					<Button className="w-full bg-[#00ff87] text-[#08080a] font-bold text-sm h-12 rounded-sm uppercase" disabled><RefreshCw size={16} className="mr-2" /> Generate Image</Button>
				</FormSection>
				<div className="space-y-6"><CoinInfoFields idPrefix="auto" /><CustomAddressGenerator idPrefix="auto" /><PreBuySection idPrefix="auto" /><LaunchButton /></div>
			</div>
		);
	}

	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
				<TerminalTextarea placeholder="describe your token's vibe... a mystical forest creature, a cyberpunk robot, a meme-worthy doge..." maxLength={3000} {...registerForm("prompt")} />
				<div className="w-full aspect-[4/3] min-h-[200px] max-h-[400px] group">
					{isGeneratingMedia ? <ImageSkeleton isGenerating={true} /> : previousImages[0] ? (
						<div className="w-full h-full relative rounded-sm overflow-hidden bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] transition-all group-hover:border-[rgba(0,255,135,0.2)]">
							<Image alt="Generated Image" src={previousImages[0]} fill className="object-contain p-2" />
							<div className="absolute top-2 left-2 bg-[#00ff87] text-[#08080a] px-2 py-1 rounded-sm text-xs font-bold uppercase flex items-center gap-1"><Check size={12} strokeWidth={3} />selected</div>
						</div>
					) : <ImageSkeleton isGenerating={false} />}
				</div>
				<div className="grid grid-cols-3 gap-3">
					{nextImages.map((img, i) => (
						<button type="button" onClick={() => img && handleSelectThumbnail(i + 1)} key={`thumb-${i}`} disabled={!img} className={cn("aspect-square relative rounded-sm overflow-hidden transition-all", img ? "cursor-pointer hover:scale-105 hover:shadow-[0_0_20px_rgba(0,255,135,0.2)]" : "cursor-not-allowed")}>
							{img ? (
								<div className="w-full h-full relative bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(0,255,135,0.3)]">
									<Image alt={`Thumbnail ${i + 1}`} src={img} fill className="object-contain p-1" />
									<div className="absolute inset-0 bg-[#00ff87]/0 hover:bg-[#00ff87]/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"><span className="text-xs font-bold text-[#00ff87] uppercase">select</span></div>
								</div>
							) : <ThumbnailSkeleton isGenerating={isGeneratingMedia} />}
						</button>
					))}
				</div>
				<Button className={cn("w-full font-bold text-sm h-12 rounded-sm uppercase transition-all", isGeneratingMedia ? "bg-[#1a1a1f] text-[#52525b]" : "bg-[#00ff87] hover:bg-[#22c55e] text-[#08080a] shadow-[0_0_20px_rgba(0,255,135,0.2)]")} onClick={handleGenerateImage} disabled={isGeneratingMedia}>
					{isGeneratingMedia ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Generating...</> : <><RefreshCw size={16} className="mr-2" /> Generate Image</>}
				</Button>
				<p className="text-[10px] text-[#52525b] text-center">tip: be specific! "a golden retriever wearing sunglasses on a beach" works better than "dog"</p>
			</FormSection>
			<div className="space-y-6"><CoinInfoFields idPrefix="auto" /><CustomAddressGenerator idPrefix="auto" /><PreBuySection idPrefix="auto" /><LaunchButton /></div>
		</div>
	);
}

export default AutoCreateForm;
