"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { ImageIcon, Video, AlertTriangle, Download, Trash2, RefreshCw, Zap, Crown } from "lucide-react";
import type { IToken, ITokenLookUp } from "@autofun/types";
import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
import useAddress from "@/hooks/use-address";
import useTokenBalance from "@/hooks/use-token-balance";
import { abbreviateNumber } from "@/lib/utils";
import { getToken } from "@/lib/api";

interface GeneratedImage {
	id: string;
	src: string;
	alt: string;
}

interface InfoTabsProps {
	generatedImages: GeneratedImage[];
	token: IToken;
}

const AiCreatePanel = ({ token }: { token: IToken }) => {
	const [activeAiTab, setActiveAiTab] = useState("image");
	const [generationMode, setGenerationMode] = useState<"fast" | "pro">("fast");
	const {
		previousImages,
		previousVideos,
		previousAudios,
		generateToken,
		registerForm,
		watchValue,
		isGeneratingMedia,
		deleteImage,
		deleteMedia,
	} = usePrompt();

	const address = useAddress();
	const tokenBalance = useTokenBalance({
		chain: token.chain,
		contractAddress: token.contractAddress,
		address,
	});

	const userTokenAmount = tokenBalance?.data || 0;

	// Get minimum balances based on media type and mode
	const getMinBalance = (mediaType: string, mode: "fast" | "pro") => {
		if (mediaType === "image") {
			return mode === "pro"
				? Number(process.env.NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE_FAST || 10000)
				: Number(process.env.NEXT_PUBLIC_GENERATION_IMAGE_MIN_BALANCE || 1000);
		}

		return mode === "pro"
			? Number(process.env.NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE_FAST || 100000)
			: Number(process.env.NEXT_PUBLIC_GENERATION_VIDEO_MIN_BALANCE || 10000);
	};

	const neededAmount = getMinBalance(activeAiTab, generationMode);
	const hasEnoughTokens = userTokenAmount >= neededAmount;

	const prompt = watchValue("prompt");

	const handleGenerateMedia = async (mediaType: "audio" | "video" | "image") => {
		if (!token || !token.contractAddress || !token.chainId) {
			return;
		}

		const promptValue = prompt?.toString() || "";
		await generateToken({
			mediaType: mediaType,
			prompt: promptValue,
			contractAddress: token.contractAddress,
		});
	};

	const handleDownload = (mediaUrl: string, index: number, type: string) => {
		const link = document.createElement("a");
		link.href = mediaUrl;
		const extension = type === "audio" ? "mp3" : type === "video" ? "mp4" : "png";
		link.download = `${token.name}-${type}-${index + 1}.${extension}`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const renderModeSelector = () => {
		const standardBalance = getMinBalance(activeAiTab, "fast");
		const fastBalance = getMinBalance(activeAiTab, "pro");
		const hasStandardTokens = userTokenAmount >= standardBalance;
		const hasFastTokens = userTokenAmount >= fastBalance;

		// if (!hasStandardTokens) {
		// 	return null;
		// }

		return (
			<div className="space-y-3 mb-4">
				<div className="flex items-center justify-between">
					<p className="text-sm font-medium text-gray-300 uppercase tracking-wider">Generation Mode</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant={generationMode === "fast" ? "default" : "outline"}
						onClick={() => setGenerationMode("fast")}
						className={`flex-1 text-sm px-3 py-2 h-auto rounded-none border-2 ${
							generationMode === "fast"
								? "border-[#03FF24] bg-[#03FF24] text-black hover:bg-[#02e020] hover:text-black"
								: "border-gray-500 text-gray-300 hover:text-gray-300 hover:bg-gray-500/10"
						}`}
					>
						<Zap size={16} className="mr-2" />
						<div className="flex flex-col items-start">
							<span className="font-medium">Fast</span>
							<span className="text-xs opacity-75">
								{abbreviateNumber(standardBalance, true)} {token.ticker}
							</span>
						</div>
					</Button>
					<Button
						variant={generationMode === "pro" ? "default" : "outline"}
						onClick={() => setGenerationMode("pro")}
						disabled={!hasFastTokens}
						className={`flex-1 text-sm px-3 py-2 h-auto rounded-none border-2 ${
							generationMode === "pro"
								? "border-[#03FF24] bg-[#03FF24] text-black hover:bg-[#02e020] hover:text-black"
								: hasFastTokens
									? "border-gray-500 text-gray-300 hover:text-gray-300 hover:bg-gray-500/10"
									: "border-gray-700 text-gray-600 cursor-not-allowed opacity-50"
						}`}
					>
						<Crown size={16} className="mr-2" />
						<div className="flex flex-col items-start">
							<span className="font-medium">Pro</span>
							<span className="text-xs opacity-75">
								{abbreviateNumber(fastBalance, true)} {token.ticker}
							</span>
						</div>
					</Button>
				</div>
			</div>
		);
	};

	const renderTabContent = () => {
		if (activeAiTab === "image") {
			return (
				<div className="space-y-4">
					{renderModeSelector()}
					<Input
						type="text"
						placeholder={`Generate images for ${token.name}...`}
						className="bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm h-10 focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] uppercase tracking-wider"
						{...registerForm("prompt")}
					/>
					{!hasEnoughTokens && (
						<div className="flex items-center gap-2 p-2 border border-[#03FF24]/40 rounded-none bg-black/30 text-xs text-gray-400 shadow-[2px_2px_0px_rgba(3,255,36,0.2)]">
							<AlertTriangle size={28} className="text-yellow-400/70 flex-shrink-0" />
							<span>
								You need to hold at least {abbreviateNumber(neededAmount, true)}{" "}
								<span className="text-[#03FF24] font-bold">{token.name}</span> tokens for {generationMode} mode
								generation.
							</span>
						</div>
					)}
					<Button
						onClick={() => handleGenerateMedia("image")}
						disabled={isGeneratingMedia || !hasEnoughTokens}
						className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black hover:text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isGeneratingMedia ? (
							<>
								<RefreshCw size={16} className="mr-2 animate-spin" />
								Generating...
							</>
						) : (
							<>
								{generationMode === "fast" ? <Crown size={18} className="mr-2" /> : <Zap size={18} className="mr-2" />}
								Generate for {token.ticker} ({generationMode})
							</>
						)}
					</Button>
					<div>
						<div className="flex items-center justify-between mb-2">
							<h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Your {token.name} Images</h3>
							{previousImages.length > 0 && (
								<span className="text-xs text-gray-500">{previousImages.length} of 12 max</span>
							)}
						</div>
						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
							{previousImages.slice(0, 12).map((img, index) => (
								<div
									key={`image-${img}`}
									className="relative group border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] overflow-hidden"
								>
									<Image
										src={img || "/placeholder.svg"}
										alt={`Generated image ${index + 1}`}
										width={200}
										height={150}
										className="w-full h-auto object-cover aspect-[4/3] pixelated-image-render group-hover:brightness-125 transition-all"
									/>
									<div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => handleDownload(img, index, "image")}
											className="h-6 w-6 p-1 text-gray-300 hover:text-[#03FF24] rounded-none"
											aria-label="Download image"
										>
											<Download size={14} />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => deleteImage(img)}
											className="h-6 w-6 p-1 text-gray-300 hover:text-red-500 rounded-none"
											aria-label="Delete image"
										>
											<Trash2 size={14} />
										</Button>
									</div>
								</div>
							))}
						</div>
						{previousImages.length === 0 && (
							<div className="text-center py-10 text-gray-500">
								<p className="text-lg uppercase">No images generated for {token.name} yet</p>
							</div>
						)}
						{previousImages.length >= 12 && (
							<div className="text-center py-4 text-yellow-400 text-sm">
								<p className="uppercase">Maximum 12 images reached. New images will replace oldest ones.</p>
							</div>
						)}
					</div>
				</div>
			);
		}

		if (activeAiTab === "video") {
			return (
				<div className="space-y-4">
					{renderModeSelector()}
					<Input
						type="text"
						placeholder={`Generate videos for ${token.name}...`}
						className="bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm h-10 focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] uppercase tracking-wider"
						{...registerForm("prompt")}
					/>
					{!hasEnoughTokens && (
						<div className="flex items-center gap-2 p-2 border border-[#03FF24]/40 rounded-none bg-black/30 text-xs text-gray-400 shadow-[2px_2px_0px_rgba(3,255,36,0.2)]">
							<AlertTriangle size={28} className="text-yellow-400/70 flex-shrink-0" />
							<span>
								You need to hold at least {abbreviateNumber(neededAmount, true)}{" "}
								<span className="text-[#03FF24] font-bold">{token.name}</span> tokens for {generationMode} mode
								generation.
							</span>
						</div>
					)}
					<Button
						onClick={() => handleGenerateMedia("video")}
						disabled={isGeneratingMedia || !hasEnoughTokens}
						className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black hover:text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isGeneratingMedia ? (
							<>
								<RefreshCw size={16} className="mr-2 animate-spin" />
								Generating...
							</>
						) : (
							<>
								{generationMode === "fast" ? <Crown size={18} className="mr-2" /> : <Zap size={18} className="mr-2" />}
								Generate for {token.ticker} ({generationMode})
							</>
						)}
					</Button>
					{/* Video grid content similar to images */}
				</div>
			);
		}

		// No audio for now

		// if (activeAiTab === "audio") {
		// 	return (
		// 		<div className="space-y-4">
		// 			{renderModeSelector()}
		// 			<Input
		// 				type="text"
		// 				placeholder={`Generate audio for ${token.name}...`}
		// 				className="bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm h-10 focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] uppercase tracking-wider"
		// 				{...registerForm("prompt")}
		// 			/>
		// 			{!hasEnoughTokens && (
		// 				<div className="flex items-center gap-2 p-2 border border-[#03FF24]/40 rounded-none bg-black/30 text-xs text-gray-400 shadow-[2px_2px_0px_rgba(3,255,36,0.2)]">
		// 					<AlertTriangle size={28} className="text-yellow-400/70 flex-shrink-0" />
		// 					<span>
		// 						You need to hold at least {abbreviateNumber(neededAmount, true)}{" "}
		// 						<span className="text-[#03FF24] font-bold">{token.name}</span> tokens for {generationMode} mode
		// 						generation.
		// 					</span>
		// 				</div>
		// 			)}
		// 			<Button
		// 				onClick={() => handleGenerateMedia("audio")}
		// 				disabled={isGeneratingMedia || !hasEnoughTokens}
		// 				className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black hover:text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
		// 			>
		// 				{isGeneratingMedia ? (
		// 					<>
		// 						<RefreshCw size={16} className="mr-2 animate-spin" />
		// 						Generating...
		// 					</>
		// 				) : (
		// 					<>
		// 						{generationMode === "fast" ? <Crown size={18} className="mr-2" /> : <Zap size={18} className="mr-2" />}
		// 						Generate for {token.ticker} ({generationMode})
		// 					</>
		// 				)}
		// 			</Button>
		// 			{/* Audio grid content similar to previous */}
		// 		</div>
		// 	);
		// }

		return null;
	};

	return (
		<div className="space-y-4 mx-4 mt-4">
			<div className="flex gap-1 border-b-2 border-[#03FF24]/30 pb-2">
				{["image", "video"].map((tab) => (
					<Button
						key={tab}
						variant={activeAiTab === tab ? "secondary" : "ghost"}
						onClick={() => setActiveAiTab(tab)}
						className={`capitalize text-sm px-3 py-1.5 h-auto rounded-none border-2 ${
							activeAiTab === tab
								? "border-black bg-[#03FF24] text-black hover:bg-[#02e020] hover:text-black"
								: "border-transparent text-gray-300 hover:text-gray-300 hover:bg-[#03FF24]/10 hover:border-[#03FF24]/50"
						}`}
					>
						{tab === "image" && <ImageIcon size={16} className="mr-2" />}
						{tab === "video" && <Video size={16} className="mr-2" />}
						{/* {tab === "audio" && <Music size={16} className="mr-2" />} */}
						{tab}
					</Button>
				))}
			</div>

			{renderTabContent()}
		</div>
	);
};

function TokenCreatePageContent({ token }: { token: IToken }) {
	return <AiCreatePanel token={token} />;
}

export default function TokenCreatePage({ params }: { params: Promise<ITokenLookUp> }) {
	const [resolvedParams, setResolvedParams] = useState<IToken | null>(null);

	useEffect(() => {
		const fetchTokenData = async () => {
			try {
				const tokenParams = await params;
				const token = await getToken(tokenParams);
				if (!token) {
					return;
				}
				setResolvedParams(token);
			} catch (error) {
				console.error("Failed to resolve token parameters:", error);
			}
		};

		fetchTokenData();
	}, [params]);

	if (!resolvedParams) {
		return (
			<div className="text-center py-10 text-gray-500">
				<p className="text-lg uppercase">Loading...</p>
			</div>
		);
	}

	return (
		<PromptProvider tokenImageQuery={`${resolvedParams.contractAddress}-${resolvedParams.chainId}-images`}>
			<TokenCreatePageContent token={resolvedParams} />
		</PromptProvider>
	);
}
