"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { UploadCloud, ImageIcon, Video, Music, AlertTriangle, Download, Trash2, RefreshCw } from "lucide-react";
import type { IToken, ITokenLookUp } from "@autofun/types";
import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
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
	const { previousImages, generateToken, registerForm, watchValue, isGeneratingMedia, deleteImage } = usePrompt();

	const prompt = watchValue("prompt");

	const handleGenerateImage = async (mediaType: "audio" | "video" | "image") => {
		if (!token || !token.contractAddress || !token.chainId) {
			return;
		}

		const promptValue = prompt?.toString() || "";
		await generateToken({ mediaType: mediaType, prompt: promptValue });
	};

	const handleDownload = (imageUrl: string, index: number) => {
		const link = document.createElement("a");
		link.href = imageUrl;
		link.download = `${token.name}-image-${index + 1}.png`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const renderTabContent = () => {
		if (activeAiTab === "image") {
			return (
				<div className="space-y-4">
					<Input
						type="text"
						placeholder={`Generate images for ${token.name}...`}
						className="bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm h-10 focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] uppercase tracking-wider"
						{...registerForm("prompt")}
					/>
					<div className="flex items-center gap-2 p-2 border border-[#03FF24]/40 rounded-none bg-black/30 text-xs text-gray-400 shadow-[2px_2px_0px_rgba(3,255,36,0.2)]">
						<AlertTriangle size={28} className="text-yellow-400/70 flex-shrink-0" />
						<span>
							You need to hold at least 1M <span className="text-[#03FF24] font-bold">{token.name}</span> tokens to
							generate images in fast mode.
						</span>
					</div>
					<Button
						onClick={() => handleGenerateImage("image")}
						disabled={isGeneratingMedia}
						className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isGeneratingMedia ? (
							<>
								<RefreshCw size={16} className="mr-2 animate-spin" />
								Generating...
							</>
						) : (
							<>
								<UploadCloud size={18} className="mr-2" />
								Generate for {token.ticker}
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
											onClick={() => handleDownload(img, index)}
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

		return (
			<div className="space-y-4">
				<Input
					type="text"
					placeholder={`Generate ${activeAiTab} for ${token.name}...`}
					className="bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm h-10 focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] uppercase tracking-wider"
				/>
				<div className="flex items-center gap-2 p-2 border border-[#03FF24]/40 rounded-none bg-black/30 text-xs text-gray-400 shadow-[2px_2px_0px_rgba(3,255,36,0.2)]">
					<AlertTriangle size={28} className="text-yellow-400/70 flex-shrink-0" />
					<span>
						You need to hold at least <span className="text-[#03FF24] font-bold">{token.name}</span> tokens to generate{" "}
						{activeAiTab} in fast mode.
					</span>
				</div>
				<Button
					disabled
					className="w-full bg-gray-600 text-gray-400 font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#404040] uppercase tracking-wider cursor-not-allowed"
				>
					<UploadCloud size={18} className="mr-2" />
					Generate {activeAiTab} for {token.ticker}
				</Button>
				<div className="text-center py-10 text-gray-500">
					<p className="text-lg uppercase animate-pulse">
						{activeAiTab} generation for {token.name} coming soon!
					</p>
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-4 mx-4 mt-4">
			<div className="flex gap-1 border-b-2 border-[#03FF24]/30 pb-2">
				{["image", "video", "audio"].map((tab) => (
					<Button
						key={tab}
						variant={activeAiTab === tab ? "secondary" : "ghost"}
						onClick={() => setActiveAiTab(tab)}
						className={`capitalize text-sm px-3 py-1.5 h-auto rounded-none border-2 ${activeAiTab === tab ? "border-black bg-[#03FF24] text-black hover:bg-[#02e020]" : "border-transparent text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 hover:border-[#03FF24]/50"}`}
					>
						{tab === "image" && <ImageIcon size={16} className="mr-2" />}
						{tab === "video" && <Video size={16} className="mr-2" />}
						{tab === "audio" && <Music size={16} className="mr-2" />}
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
