"use client";
import Image from "next/image";
import { FormSection } from "./form-section";
import { TerminalTextarea } from "./terminal-textarea";
import { DeployButton } from "./deploy-button";
import { Wand2, RefreshCw, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import {
	CoinInfoFields,
	CustomAddressGenerator,
	PreBuySection,
} from "./shared-form-section";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { createToken } from "@/lib/api";
import useBalance from "@/hooks/use-balance";
import { createTokenTx } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import type { AddressLike, TChain } from "@waifufun/types";
import { getErrorMessage } from "@/lib/errorMessage";

// Image placeholder with skeleton loading
const ImageSkeleton = () => (
	<div className="w-full h-full bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex items-center justify-center overflow-hidden relative">
		<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.03)] to-transparent animate-pulse" />
		<div className="text-[#52525b] text-xs font-mono uppercase tracking-wider">awaiting prompt</div>
	</div>
);

// Glitch effect loading animation
const GlitchLoader = () => (
	<div className="w-full h-full bg-[#0a0a0c] border border-[#00ff87]/30 rounded-sm flex flex-col items-center justify-center overflow-hidden relative">
		{/* Scanline effect */}
		<div className="absolute inset-0 pointer-events-none overflow-hidden">
			<div className="absolute w-full h-1 bg-[#00ff87]/10 animate-scanline" />
		</div>
		{/* Grid pattern */}
		<div className="absolute inset-0 opacity-10" style={{ 
			backgroundImage: 'linear-gradient(rgba(0,255,135,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,135,0.1) 1px, transparent 1px)',
			backgroundSize: '20px 20px'
		}} />
		{/* Glitch text */}
		<div className="relative">
			<Sparkles size={24} className="text-[#00ff87] animate-pulse mb-3" />
		</div>
		<div className="relative">
			<span className="text-[#00ff87] font-mono text-sm uppercase tracking-widest animate-flicker">generating</span>
			<span className="absolute inset-0 text-[#00ff87]/30 font-mono text-sm uppercase tracking-widest animate-glitch" style={{ clipPath: 'inset(0 0 50% 0)' }}>generating</span>
		</div>
		<div className="flex gap-1 mt-2">
			{[0, 1, 2].map((i) => (
				<div key={i} className="w-2 h-2 bg-[#00ff87] rounded-sm animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
			))}
		</div>
	</div>
);

// Image display with hover state
const AIImageDisplay = ({ href, isSelected = false, onClick }: { href: string | undefined; isSelected?: boolean; onClick?: () => void }) => {
	if (!href) return <ImageSkeleton />;
	
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full h-full relative rounded-sm overflow-hidden transition-all duration-200 group",
				isSelected && "ring-2 ring-[#00ff87] ring-offset-2 ring-offset-[#08080a]",
				onClick && "cursor-pointer hover:ring-2 hover:ring-[#00ff87]/50"
			)}
		>
			<Image alt="Generated Image" src={href} fill className="object-contain p-2 bg-[rgba(17,17,20,0.7)]" />
			{isSelected && (
				<div className="absolute top-2 right-2 w-6 h-6 bg-[#00ff87] rounded-sm flex items-center justify-center">
					<Check size={14} className="text-[#08080a]" />
				</div>
			)}
			{onClick && !isSelected && (
				<div className="absolute inset-0 bg-[#00ff87]/0 group-hover:bg-[#00ff87]/5 transition-colors" />
			)}
		</button>
	);
};

// Thumbnail skeleton
const ThumbnailSkeleton = ({ index }: { index: number }) => (
	<div 
		className="aspect-square bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex items-center justify-center"
		style={{ animationDelay: `${index * 0.1}s` }}
	>
		<div className="w-6 h-6 border-2 border-[rgba(255,255,255,0.1)] border-t-[#00ff87]/30 rounded-full animate-spin" />
	</div>
);

function AutoCreateForm() {
	const wallet = useWallet();
	const { connection } = useConnection();
	const router = useRouter();
	const [chain, chainId] = ["solana", process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 103 : 101];
	
	const { 
		registerForm, 
		generateToken, 
		watchValue, 
		previousImages, 
		isGeneratingMedia, 
		changeMainImage,
		handleSubmit,
		formState,
		isGeneratingAddress,
		getTokenData,
		pool,
		mintKeyPair,
		setLaunching,
		setMintKeyPair,
		isLaunching,
	} = usePrompt();
	
	const [isClient, setIsClient] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const prompt = watchValue("prompt");

	const balanceQuery = useBalance({
		chain: "solana",
		address: (wallet?.publicKey?.toString() || "") as AddressLike,
	});
	const balance = balanceQuery?.data || 0;

	const createTokenMutation = useMutation({
		mutationFn: createToken,
		mutationKey: ["createToken"],
		onSuccess: (tx, variables) => {
			toast.success("Token created successfully!");
			router.push(`/token/${chain}/${chainId}/${variables.contractAddress}`);
			setMintKeyPair(null);
		},
		onError: (error) => {
			const message = getErrorMessage(error);
			toast.error(`Error creating token: ${message}`);
		},
	});

	// Thumbnails: next 3 images after main
	const startingIndex = isGeneratingMedia ? 0 : 1;
	const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);
	while (nextImages.length < 3) nextImages.push(undefined);

	const handleGenerateImage = () => {
		generateToken({
			mediaType: "image",
			prompt: prompt?.toString() || "",
		});
	};

	const handleSelectImage = (index: number) => {
		if (previousImages[index]) {
			changeMainImage(index);
			setSelectedIndex(0);
		}
	};

	const handleLaunch = async () => {
		if (!formState.isValid) {
			toast.error("Please fill in all required fields.");
			return;
		}
		if (isGeneratingAddress) {
			toast.error("Please wait for the address to be generated.");
			return;
		}
		if (isGeneratingMedia) {
			toast.error("Please wait for the image to be generated.");
			return;
		}
		if (!mintKeyPair) {
			toast.error("Please generate a custom address first.");
			return;
		}
		if (balance < 0.04) {
			toast.error("Insufficient balance. You need at least 0.04 SOL to create a token.");
			return;
		}

		setLaunching(true);
		try {
			const tokenData = await getTokenData(false);
			const tx = await createTokenTx(tokenData, { connection, wallet });
			createTokenMutation.mutate({
				contractAddress: mintKeyPair?.publicKey.toString() || "",
				chain: chain as TChain,
				chainId: chainId,
				pool: pool,
				signature: tx?.signature.toString() || "",
			});
		} catch (error) {
			const message = getErrorMessage(error);
			toast.error(`Error creating token: ${message}`);
		} finally {
			setLaunching(false);
		}
	};

	const shouldDisable = !formState.isValid || isGeneratingAddress || isGeneratingMedia || isLaunching || !mintKeyPair;

	useEffect(() => {
		setIsClient(true);
	}, []);

	// Hydration placeholder
	if (!isClient) {
		return (
			<div className="grid md:grid-cols-2 gap-6 md:items-start">
				<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
					<TerminalTextarea
						placeholder="describe your token's vibe... (e.g., a cyberpunk cat in neon Tokyo)"
						className="min-h-[100px]"
						disabled
					/>
					<div className="w-full aspect-[4/3] min-h-[200px] max-h-[400px]">
						<ImageSkeleton />
					</div>
					<div className="grid grid-cols-3 gap-3">
						{[0, 1, 2].map((i) => (
							<div key={i} className="aspect-square bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm opacity-50" />
						))}
					</div>
				</FormSection>
				<div className="space-y-6">
					<CoinInfoFields idPrefix="auto" />
					<CustomAddressGenerator idPrefix="auto" />
					<PreBuySection idPrefix="auto" />
					<DeployButton disabled>LAUNCH TOKEN</DeployButton>
				</div>
			</div>
		);
	}

	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			{/* Left Column: AI Image Generation */}
			<FormSection title="AI Image Generation" className="space-y-4" collapsible={false}>
				{/* Terminal-style prompt input */}
				<TerminalTextarea
					placeholder="describe your token's vibe... (e.g., a cyberpunk cat in neon Tokyo)"
					className="min-h-[100px]"
					{...registerForm("prompt")}
				/>

				{/* Main Generated Image */}
				<div className="w-full aspect-[4/3] min-h-[200px] max-h-[400px]">
					{isGeneratingMedia ? (
						<GlitchLoader />
					) : (
						<AIImageDisplay href={previousImages[0]} isSelected={selectedIndex === 0} />
					)}
				</div>

				{/* Thumbnail Grid */}
				<div className="grid grid-cols-3 gap-3">
					{nextImages.map((image, index) => (
						<div key={`thumb-${index}`} className="aspect-square">
							{isGeneratingMedia && index === 0 ? (
								<ThumbnailSkeleton index={index} />
							) : image ? (
								<AIImageDisplay
									href={image}
									onClick={() => handleSelectImage(index + 1)}
								/>
							) : (
								<div className="w-full h-full bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex items-center justify-center">
									<span className="text-[#52525b] text-[10px] font-mono">empty</span>
								</div>
							)}
						</div>
					))}
				</div>

				{/* Generate Button */}
				<button
					type="button"
					onClick={handleGenerateImage}
					disabled={isGeneratingMedia}
					className={cn(
						"w-full py-3 rounded-sm font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2",
						isGeneratingMedia
							? "bg-[#1a1a1f] text-[#52525b] cursor-not-allowed"
							: "bg-[rgba(0,255,135,0.1)] text-[#00ff87] border border-[#00ff87]/30 hover:bg-[rgba(0,255,135,0.15)] hover:border-[#00ff87]/50"
					)}
				>
					{isGeneratingMedia ? (
						<>
							<RefreshCw size={16} className="animate-spin" />
							<span>Generating...</span>
						</>
					) : (
						<>
							<Wand2 size={16} />
							<span>Generate Image</span>
						</>
					)}
				</button>

				{/* Helper text */}
				<p className="text-[10px] text-[#52525b] text-center">
					AI generates 4 variations. Click thumbnails to select a different image.
				</p>
			</FormSection>

			{/* Right Column: Token Configuration */}
			<div className="space-y-6">
				<CoinInfoFields idPrefix="auto" />
				<CustomAddressGenerator idPrefix="auto" />
				<PreBuySection idPrefix="auto" />
				
				{/* Premium Deploy Button */}
				<DeployButton
					onClick={handleLaunch}
					disabled={shouldDisable}
					isLoading={isLaunching}
				>
					LAUNCH TOKEN
				</DeployButton>

				{/* Launch requirements hint */}
				{!mintKeyPair && (
					<p className="text-[10px] text-center text-yellow-400/80">
						↑ Generate a custom address to enable launch
					</p>
				)}
			</div>
		</div>
	);
}

export default AutoCreateForm;
