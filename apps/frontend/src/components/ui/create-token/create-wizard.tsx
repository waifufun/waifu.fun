"use client";

import { useState, useRef } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/create-token/textarea";
import { TerminalTextarea } from "@/components/ui/create-token/terminal-textarea";
import { cn } from "@/lib/utils";
import {
	usePrompt,
	nameValidation,
	tickerValidation,
	descriptionValidation,
} from "@/components/hooks/providers/usePromptContext";
import {
	CustomAddressGenerator,
	PreBuySection,
	PoolSelection,
	LaunchButton,
	CustomCurveSection,
	DelayedStartSection,
	TradeLimitSection,
} from "./shared-form-section";
import {
	ChevronLeft,
	ChevronRight,
	UploadCloud,
	X,
	RefreshCw,
	Check,
	User,
	Image as ImageIcon,
	DollarSign,
	Rocket,
	MessageSquare,
	Twitter,
	Send,
} from "lucide-react";
import { toast } from "sonner";

const formElementBaseClass =
	"bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm";
const formLabelBaseClass = "text-xs text-[#71717a] uppercase tracking-wider font-medium";

const PLATFORMS = [
	{ id: "twitter", label: "Twitter", icon: Twitter },
	{ id: "discord", label: "Discord", icon: MessageSquare },
	{ id: "telegram", label: "Telegram", icon: Send },
] as const;

const WIZARD_STEPS = [
	{ id: 1, label: "Identity", icon: User },
	{ id: 2, label: "Appearance", icon: ImageIcon },
	{ id: 3, label: "Platforms", icon: MessageSquare },
	{ id: 4, label: "Economics", icon: DollarSign },
	{ id: 5, label: "Deploy", icon: Rocket },
];

// Step Indicator Component
function WizardStepIndicator({
	currentStep,
	onStepClick,
}: { currentStep: number; onStepClick: (step: number) => void }) {
	return (
		<div className="w-full max-w-3xl mx-auto mb-8">
			<div className="flex items-center justify-between relative px-4">
				{/* Progress Line */}
				<div className="absolute top-5 left-0 right-0 h-[2px] bg-[rgba(255,255,255,0.06)] mx-[10%]" />
				<div
					className="absolute top-5 left-0 h-[2px] bg-[#00ff87] transition-all duration-500 mx-[10%]"
					style={{
						width: `${((currentStep - 1) / (WIZARD_STEPS.length - 1)) * 80}%`,
						boxShadow: "0 0 8px rgba(0,255,135,0.5)",
					}}
				/>

				{WIZARD_STEPS.map((step, i) => {
					const completed = step.id < currentStep;
					const current = step.id === currentStep;
					const pending = step.id > currentStep;
					const Icon = step.icon;

					return (
						<button
							key={step.id}
							type="button"
							onClick={() => {
								// Allow clicking on completed steps or current step
								if (step.id <= currentStep) {
									onStepClick(step.id);
								}
							}}
							disabled={step.id > currentStep}
							className={cn(
								"relative flex flex-col items-center z-10 transition-all group",
								step.id <= currentStep ? "cursor-pointer" : "cursor-not-allowed",
							)}
						>
							<div
								className={cn(
									"w-10 h-10 rounded-sm flex items-center justify-center text-xs font-mono font-bold uppercase transition-all",
									completed &&
										"bg-[#00ff87] text-[#08080a] shadow-[0_0_12px_rgba(0,255,135,0.4)] group-hover:scale-110",
									current &&
										"bg-[#00ff87] text-[#08080a] shadow-[0_0_16px_rgba(0,255,135,0.6)] ring-2 ring-[#00ff87]/30 ring-offset-2 ring-offset-[#08080a]",
									pending && "bg-[#111114] border border-[rgba(255,255,255,0.1)] text-[#52525b]",
								)}
							>
								{completed ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
							</div>
							<span
								className={cn(
									"mt-2 text-[10px] uppercase tracking-[0.12em] font-mono hidden sm:block",
									completed && "text-[#00ff87]",
									current && "text-[#e4e4e7] font-bold",
									pending && "text-[#52525b]",
								)}
							>
								{step.label}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// Step 1: Agent Identity
function Step1AgentIdentity() {
	const {
		registerForm,
		formState: { errors },
	} = usePrompt();

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<User className="w-4 h-4 text-[#00ff87]" />
					<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">step 1</span>
				</div>
				<h2 className="text-2xl font-bold text-[#e4e4e7] mb-2">Who is your agent?</h2>
				<p className="text-sm text-[#71717a]">
					Give your agent a name and identity. This becomes the token name on-chain.
				</p>
			</div>

			{/* Card with corner brackets */}
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/35" />
				<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/35" />

				<div className="space-y-4">
					{/* Name & Ticker */}
					<div className="grid sm:grid-cols-2 gap-4">
						<div>
							<Label htmlFor="wizardName" className={formLabelBaseClass}>
								Name <span className="text-red-500">*</span>
							</Label>
							<Input
								type="text"
								id="wizardName"
								placeholder="My Agent"
								className={cn(formElementBaseClass, "mt-1 h-10", errors.name && "border-red-500 focus:border-red-500")}
								{...registerForm("name", nameValidation)}
							/>
							{errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
						</div>
						<div>
							<Label htmlFor="wizardTicker" className={formLabelBaseClass}>
								Ticker <span className="text-red-500">*</span>
							</Label>
							<div className="relative">
								<Input
									type="text"
									id="wizardTicker"
									placeholder="AGENT"
									className={cn(
										formElementBaseClass,
										"mt-1 h-10 pl-6",
										errors.symbol && "border-red-500 focus:border-red-500",
									)}
									{...registerForm("symbol", tickerValidation)}
								/>
								<span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-sm">$</span>
							</div>
							{errors.symbol && <p className="text-red-500 text-xs mt-1">{errors.symbol.message}</p>}
						</div>
					</div>

					{/* Description */}
					<div>
						<Label htmlFor="wizardDescription" className={formLabelBaseClass}>
							Description <span className="text-red-500">*</span>
						</Label>
						<Textarea
							id="wizardDescription"
							placeholder="Describe what your agent does..."
							className={cn(
								formElementBaseClass,
								"mt-1 min-h-[80px]",
								errors.description && "border-red-500 focus:border-red-500",
							)}
							{...registerForm("description", descriptionValidation)}
						/>
						{errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
					</div>

					{/* Personality Prompt (Optional) */}
					<div>
						<Label htmlFor="wizardPersonality" className={formLabelBaseClass}>
							Personality (Optional)
						</Label>
						<Textarea
							id="wizardPersonality"
							placeholder="Friendly, witty, professional, meme-loving..."
							className={cn(formElementBaseClass, "mt-1 min-h-[60px]")}
							{...registerForm("prompt")}
						/>
						<p className="text-[10px] text-[#52525b] mt-1">How should your agent interact with people?</p>
					</div>
				</div>

				<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/35" />
				<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/35" />
			</div>
		</div>
	);
}

// Step 2: Agent Appearance
function Step2AgentAppearance() {
	const {
		uploadedImage,
		setUploadedImage,
		previousImages,
		registerForm,
		generateToken,
		watchValue,
		isGeneratingMedia,
		changeMainImage,
	} = usePrompt();
	const [imageMode, setImageMode] = useState<"upload" | "generate">("generate");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragActive, setIsDragActive] = useState(false);
	const prompt = watchValue("prompt");

	const displayImage =
		uploadedImage === null ? undefined : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);

	const validateFile = (file: File): boolean => {
		const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
		const maxSize = 5 * 1024 * 1024; // 5MB

		if (!allowedTypes.includes(file.type)) {
			toast.error("Invalid file type. Please upload a PNG, JPEG, GIF, or WEBP.");
			return false;
		}

		if (file.size > maxSize) {
			toast.error("File is too large. Maximum size is 5MB.");
			return false;
		}

		return true;
	};

	const processFile = (file: File) => {
		if (!validateFile(file)) return;

		const reader = new FileReader();
		reader.onloadend = () => {
			const base64String = reader.result as string;
			setUploadedImage(base64String);
			toast.success("Image uploaded successfully!");
		};
		reader.readAsDataURL(file);
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			processFile(file);
			if (event.target) {
				event.target.value = "";
			}
		}
	};

	const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragActive(true);
	};

	const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			setIsDragActive(false);
		}
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragActive(false);

		const files = Array.from(e.dataTransfer.files);
		const file = files[0];

		if (file) {
			processFile(file);
		} else {
			toast.error("No valid file detected. Please try again.");
		}
	};

	const handleGenerateImage = () => generateToken({ mediaType: "image", prompt: prompt?.toString() || "" });
	const handleSelectThumbnail = (index: number) => changeMainImage(index);

	const startingIndex = isGeneratingMedia ? 0 : 1;
	const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);
	while (nextImages.length < 3) nextImages.push(undefined);
	const thumbnailSlots = [
		{ id: "thumb-1", image: nextImages[0], imageIndex: 1 },
		{ id: "thumb-2", image: nextImages[1], imageIndex: 2 },
		{ id: "thumb-3", image: nextImages[2], imageIndex: 3 },
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<ImageIcon className="w-4 h-4 text-[#00ff87]" />
					<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">step 2</span>
				</div>
				<h2 className="text-2xl font-bold text-[#e4e4e7] mb-2">Design your agent</h2>
				<p className="text-sm text-[#71717a]">Upload an image or let AI generate one for you.</p>
			</div>

			{/* Mode Toggle */}
			<div className="flex gap-3 justify-center">
				<button
					type="button"
					onClick={() => setImageMode("upload")}
					className={cn(
						"px-6 py-2 rounded-sm font-mono text-xs uppercase tracking-wider transition-all",
						imageMode === "upload"
							? "bg-[#00ff87] text-[#08080a] shadow-[0_0_12px_rgba(0,255,135,0.4)]"
							: "bg-[#111114] border border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.15)]",
					)}
				>
					<UploadCloud size={14} className="inline mr-2" />
					Upload Image
				</button>
				<button
					type="button"
					onClick={() => setImageMode("generate")}
					className={cn(
						"px-6 py-2 rounded-sm font-mono text-xs uppercase tracking-wider transition-all",
						imageMode === "generate"
							? "bg-[#00ff87] text-[#08080a] shadow-[0_0_12px_rgba(0,255,135,0.4)]"
							: "bg-[#111114] border border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.15)]",
					)}
				>
					<ImageIcon size={14} className="inline mr-2" />
					Generate with AI
				</button>
			</div>

			{/* Card with corner brackets */}
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/35" />
				<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/35" />

				{imageMode === "upload" ? (
					<div className="space-y-4">
						<div
							className="w-full h-[320px] relative"
							onDragEnter={handleDragEnter}
							onDragLeave={handleDragLeave}
							onDragOver={handleDragOver}
							onDrop={handleDrop}
						>
							{!displayImage && (
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									className={cn(
										"w-full h-full border border-dashed rounded-sm flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors group focus:outline-none focus:ring-1 focus:ring-[#00ff87]",
										isDragActive
											? "bg-[rgba(0,255,135,0.08)] border-[#00ff87]"
											: "bg-[rgba(17,17,20,0.7)] border-[rgba(255,255,255,0.15)] hover:border-[#00ff87] hover:bg-[rgba(17,17,20,0.9)]",
									)}
								>
									<UploadCloud
										size={48}
										className={cn(
											"mb-2 transition-colors",
											isDragActive ? "text-[#00ff87]" : "text-[#00ff87]/70 group-hover:text-[#00ff87]",
										)}
									/>
									<p
										className={cn(
											"text-sm transition-colors",
											isDragActive ? "text-[#e4e4e7]" : "text-[#a1a1aa] group-hover:text-[#e4e4e7]",
										)}
									>
										{isDragActive ? (
											"Drop your image here"
										) : (
											<>
												Drag & drop an image or <span className="text-[#00ff87] font-semibold">click to upload</span>
											</>
										)}
									</p>
									<p className="text-xs text-[#52525b] mt-1">PNG, JPG, GIF, WEBP up to 5MB. Recommended: Square.</p>
								</button>
							)}
							{displayImage && (
								<div className="w-full h-full relative rounded-sm overflow-hidden bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)]">
									<Image src={displayImage} alt="Token preview" fill className="object-contain p-2" />
									<button
										type="button"
										onClick={() => setUploadedImage(undefined)}
										className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-sm w-6 h-6 flex items-center justify-center transition-colors"
									>
										<X size={14} />
									</button>
								</div>
							)}
							<input
								type="file"
								ref={fileInputRef}
								onChange={handleFileChange}
								accept="image/png, image/jpeg, image/gif, image/webp"
								style={{ display: "none" }}
							/>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<TerminalTextarea
							placeholder="describe your agent's appearance... a mystical forest creature, a cyberpunk robot, a meme-worthy doge..."
							maxLength={3000}
							{...registerForm("prompt")}
						/>
						<div className="w-full aspect-[4/3] min-h-[200px] max-h-[400px] group">
							{isGeneratingMedia ? (
								<div className="w-full h-full bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col items-center justify-center relative overflow-hidden">
									<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.05)] to-transparent animate-shimmer" />
									<div className="relative">
										<p className="text-[#00ff87] font-mono text-sm uppercase tracking-widest animate-glitch">
											generating
										</p>
										<div className="flex gap-1 mt-2 justify-center">
											<span
												className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce"
												style={{ animationDelay: "0ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce"
												style={{ animationDelay: "150ms" }}
											/>
											<span
												className="w-1.5 h-1.5 bg-[#00ff87] rounded-full animate-bounce"
												style={{ animationDelay: "300ms" }}
											/>
										</div>
									</div>
								</div>
							) : previousImages[0] ? (
								<div className="w-full h-full relative rounded-sm overflow-hidden bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] transition-all group-hover:border-[rgba(0,255,135,0.2)]">
									<Image alt="Generated Image" src={previousImages[0]} fill className="object-contain p-2" />
									<div className="absolute top-2 left-2 bg-[#00ff87] text-[#08080a] px-2 py-1 rounded-sm text-xs font-bold uppercase flex items-center gap-1">
										<Check size={12} strokeWidth={3} />
										selected
									</div>
								</div>
							) : (
								<div className="w-full h-full bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col items-center justify-center">
									<ImageIcon size={24} className="text-[#52525b]" />
									<p className="text-[#52525b] text-sm font-mono mt-2">no image</p>
								</div>
							)}
						</div>
						<div className="grid grid-cols-3 gap-3">
							{thumbnailSlots.map((slot) => (
								<button
									type="button"
									onClick={() => slot.image && handleSelectThumbnail(slot.imageIndex)}
									key={slot.id}
									disabled={!slot.image}
									className={cn(
										"aspect-square relative rounded-sm overflow-hidden transition-all",
										slot.image
											? "cursor-pointer hover:scale-105 hover:shadow-[0_0_20px_rgba(0,255,135,0.2)]"
											: "cursor-not-allowed",
									)}
								>
									{slot.image ? (
										<div className="w-full h-full relative bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(0,255,135,0.3)]">
											<Image
												alt={`Thumbnail ${slot.imageIndex}`}
												src={slot.image}
												fill
												className="object-contain p-1"
											/>
											<div className="absolute inset-0 bg-[#00ff87]/0 hover:bg-[#00ff87]/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
												<span className="text-xs font-bold text-[#00ff87] uppercase">select</span>
											</div>
										</div>
									) : (
										<div className="w-full h-full bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.04)] rounded-sm flex items-center justify-center relative overflow-hidden">
											{isGeneratingMedia && (
												<div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.03)] to-transparent animate-shimmer" />
											)}
										</div>
									)}
								</button>
							))}
						</div>
						<Button
							className={cn(
								"w-full font-bold text-sm h-12 rounded-sm uppercase transition-all",
								isGeneratingMedia
									? "bg-[#1a1a1f] text-[#52525b]"
									: "bg-[#00ff87] hover:bg-[#22c55e] text-[#08080a] shadow-[0_0_20px_rgba(0,255,135,0.2)]",
							)}
							onClick={handleGenerateImage}
							disabled={isGeneratingMedia}
						>
							{isGeneratingMedia ? (
								<>
									<RefreshCw size={16} className="mr-2 animate-spin" /> Generating...
								</>
							) : (
								<>
									<RefreshCw size={16} className="mr-2" /> Generate Image
								</>
							)}
						</Button>
						<p className="text-[10px] text-[#52525b] text-center">
							tip: be specific! "a golden retriever wearing sunglasses on a beach" works better than "dog"
						</p>
					</div>
				)}

				<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/35" />
				<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/35" />
			</div>
		</div>
	);
}

// Step 3: Agent Configuration (Platforms)
function Step3AgentConfiguration() {
	const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

	const togglePlatform = (id: string) => {
		setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<MessageSquare className="w-4 h-4 text-[#00ff87]" />
					<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">step 3</span>
				</div>
				<h2 className="text-2xl font-bold text-[#e4e4e7] mb-2">Where will your agent live?</h2>
				<p className="text-sm text-[#71717a]">You can configure this after launch too</p>
			</div>

			{/* Card with corner brackets */}
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/35" />
				<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/35" />

				<div className="space-y-4">
					<p className="text-xs text-[#a1a1aa] mb-4">Choose where your agent will be active (optional):</p>
					<div className="grid grid-cols-3 gap-4">
						{PLATFORMS.map((platform) => {
							const selected = selectedPlatforms.includes(platform.id);
							const Icon = platform.icon;
							return (
								<button
									key={platform.id}
									type="button"
									onClick={() => togglePlatform(platform.id)}
									className={cn(
										"flex flex-col items-center gap-2 py-6 px-4 rounded-sm border text-sm font-mono uppercase tracking-wider transition-all",
										selected
											? "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87] shadow-[0_0_12px_rgba(0,255,135,0.2)]"
											: "border-white/8 bg-white/3 text-[#71717a] hover:border-white/15 hover:text-[#a1a1aa]",
									)}
								>
									<Icon size={24} />
									<span className="text-xs">{platform.label}</span>
								</button>
							);
						})}
					</div>
					<div className="bg-[rgba(0,255,135,0.06)] border border-[rgba(0,255,135,0.15)] rounded-sm p-3 mt-4">
						<p className="text-xs text-[#a1a1aa] leading-relaxed">
							<span className="text-[#00ff87] font-semibold">Optional:</span> You can skip this step and configure your
							agent's platforms later from your token dashboard.
						</p>
					</div>
				</div>

				<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/35" />
				<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/35" />
			</div>
		</div>
	);
}

// Step 4: Token Economics
function Step4TokenEconomics() {
	const [advancedOpen, setAdvancedOpen] = useState(false);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<DollarSign className="w-4 h-4 text-[#00ff87]" />
					<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">step 4</span>
				</div>
				<h2 className="text-2xl font-bold text-[#e4e4e7] mb-2">Token economics</h2>
				<p className="text-sm text-[#71717a]">Estimated cost: ~0.02-0.04 BNB in network fees + your pre-buy amount</p>
			</div>

			{/* Card with corner brackets */}
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/35" />
				<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/35" />

				<div className="space-y-6">
					<CustomAddressGenerator idPrefix="wizard" collapsible={false} defaultOpen={true} />
					<PreBuySection idPrefix="wizard" collapsible={false} defaultOpen={true} />

					{/* Advanced Section Toggle */}
					<div className="border-t border-[rgba(255,255,255,0.06)] pt-4">
						<button
							type="button"
							onClick={() => setAdvancedOpen(!advancedOpen)}
							className="w-full flex items-center justify-between text-sm font-mono uppercase tracking-wider text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors"
						>
							<span>Advanced Settings</span>
							<ChevronRight className={cn("w-4 h-4 transition-transform", advancedOpen && "rotate-90")} />
						</button>

						{advancedOpen && (
							<div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
								<CustomCurveSection collapsible={false} defaultOpen={true} />
								<DelayedStartSection collapsible={false} defaultOpen={true} />
								<TradeLimitSection collapsible={false} defaultOpen={true} />
								<PoolSelection collapsible={false} defaultOpen={true} />
							</div>
						)}
					</div>
				</div>

				<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/35" />
				<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/35" />
			</div>
		</div>
	);
}

// Step 5: Review & Deploy
function Step5ReviewDeploy() {
	const { watchValue, uploadedImage, previousImages, launchSalt } = usePrompt();

	const name = watchValue("name") || "Untitled";
	const symbol = watchValue("symbol") || "TOKEN";
	const description = watchValue("description") || "";
	const buyAmount = watchValue("buyAmount") || 0;
	const displayImage =
		uploadedImage === null ? undefined : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="text-center">
				<div className="inline-flex items-center gap-2 mb-3">
					<Rocket className="w-4 h-4 text-[#00ff87]" />
					<span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">step 5</span>
				</div>
				<h2 className="text-2xl font-bold text-[#e4e4e7] mb-2">Review & deploy</h2>
				<p className="text-sm text-[#71717a]">Double-check everything before launching on-chain</p>
			</div>

			{/* Summary Card */}
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/35" />
				<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/35" />

				<div className="space-y-6">
					{/* Image Preview */}
					{displayImage && (
						<div className="flex justify-center">
							<div className="w-40 h-40 relative rounded-sm overflow-hidden bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)]">
								<Image src={displayImage} alt="Token preview" fill className="object-contain p-2" />
							</div>
						</div>
					)}

					{/* Agent Info */}
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div className="space-y-1">
							<p className="text-xs font-mono uppercase text-[#52525b]">Name</p>
							<p className="text-[#e4e4e7] font-semibold">{name}</p>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-mono uppercase text-[#52525b]">Ticker</p>
							<p className="text-[#e4e4e7] font-semibold font-mono">${symbol}</p>
						</div>
					</div>

					{description && (
						<div className="space-y-1">
							<p className="text-xs font-mono uppercase text-[#52525b]">Description</p>
							<p className="text-[#a1a1aa] text-sm leading-relaxed">{description}</p>
						</div>
					)}

					{/* Economics */}
					<div className="grid grid-cols-2 gap-4 text-sm border-t border-[rgba(255,255,255,0.06)] pt-4">
						<div className="space-y-1">
							<p className="text-xs font-mono uppercase text-[#52525b]">Pre-buy Amount</p>
							<p className="text-[#00ff87] font-semibold font-mono">{buyAmount} BNB</p>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-mono uppercase text-[#52525b]">Launch Salt</p>
							<p className="text-[#a1a1aa] text-xs font-mono truncate">{launchSalt ? "Generated ✓" : "None"}</p>
						</div>
					</div>

					{/* Warning */}
					<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm p-3">
						<p className="text-xs text-yellow-400 leading-relaxed">
							⚠️ <span className="font-semibold">Final check:</span> Once deployed, your token is on-chain and immutable.
							Make sure everything is correct!
						</p>
					</div>

					{/* Launch Button */}
					<LaunchButton />
				</div>

				<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/35" />
				<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/35" />
			</div>
		</div>
	);
}

// Main Wizard Component
export function CreateWizard() {
	const [currentStep, setCurrentStep] = useState(1);
	const {
		formState: { errors },
		watchValue,
		uploadedImage,
		previousImages,
		isLaunching,
	} = usePrompt();

	// Validation logic for each step
	const canProceedStep1 = () => {
		const name = watchValue("name");
		const symbol = watchValue("symbol");
		const description = watchValue("description");
		return !!(name && symbol && description && !errors.name && !errors.symbol && !errors.description);
	};

	const canProceedStep2 = () => {
		const displayImage =
			uploadedImage === null ? undefined : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);
		return !!displayImage;
	};

	const handleNext = () => {
		// Validate before proceeding
		if (currentStep === 1 && !canProceedStep1()) {
			toast.error("Please fill in all required fields in Agent Identity");
			return;
		}

		if (currentStep === 2 && !canProceedStep2()) {
			toast.error("Please upload or generate an image for your agent");
			return;
		}

		if (currentStep < 5) {
			setCurrentStep(currentStep + 1);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	const handleBack = () => {
		if (currentStep > 1) {
			setCurrentStep(currentStep - 1);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	const handleStepClick = (step: number) => {
		// Only allow navigating to completed or current step
		if (step <= currentStep) {
			setCurrentStep(step);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	return (
		<div className="w-full max-w-4xl mx-auto">
			<WizardStepIndicator currentStep={currentStep} onStepClick={handleStepClick} />

			{/* Step Content */}
			<div className="min-h-[500px]">
				{currentStep === 1 && <Step1AgentIdentity />}
				{currentStep === 2 && <Step2AgentAppearance />}
				{currentStep === 3 && <Step3AgentConfiguration />}
				{currentStep === 4 && <Step4TokenEconomics />}
				{currentStep === 5 && <Step5ReviewDeploy />}
			</div>

			{/* Navigation Buttons */}
			{currentStep < 5 && (
				<div className="flex gap-4 mt-8">
					<Button
						variant="outline"
						onClick={handleBack}
						disabled={currentStep === 1}
						className="flex-1 h-12 text-sm font-mono uppercase border-[rgba(255,255,255,0.1)] text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.2)] disabled:opacity-30 disabled:cursor-not-allowed"
					>
						<ChevronLeft size={16} className="mr-2" />
						Back
					</Button>
					<Button
						onClick={handleNext}
						disabled={isLaunching}
						className="flex-1 h-12 text-sm font-mono uppercase bg-[#00ff87] hover:bg-[#22c55e] text-[#08080a]"
					>
						Next
						<ChevronRight size={16} className="ml-2" />
					</Button>
				</div>
			)}
		</div>
	);
}
