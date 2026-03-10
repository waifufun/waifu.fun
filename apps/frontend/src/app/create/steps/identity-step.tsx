"use client";

import { useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Image from "next/image";
import { UploadCloud, X, Wand2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/create-token/form-section";
import { Textarea } from "@/components/ui/create-token/textarea";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { CoinInfoFields } from "@/components/ui/create-token/shared-form-section";
import { useDraft } from "../draft-context";

const formElementBaseClass =
	"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";

/* ------------------------------------------------------------------ */
/*  Image upload + AI generation combo                                 */
/* ------------------------------------------------------------------ */

function ImageSection() {
	const {
		uploadedImage,
		setUploadedImage,
		previousImages,
		isGeneratingMedia,
		registerForm,
		generateToken,
		watchValue,
		changeMainImage,
	} = usePrompt();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragActive, setIsDragActive] = useState(false);
	const [isConverting, setIsConverting] = useState(false);

	const prompt = watchValue("prompt");

	const displayImage =
		uploadedImage === null
			? undefined
			: uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);

	const validateFile = (file: File): boolean => {
		const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			toast.error("Invalid file type. Please upload a PNG, JPEG, GIF, or WEBP.");
			return false;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error("File is too large. Maximum size is 5MB.");
			return false;
		}
		return true;
	};

	const processFile = (file: File) => {
		if (!validateFile(file)) return;
		const reader = new FileReader();
		reader.onloadend = () => {
			setUploadedImage(reader.result as string);
			toast.success("Image uploaded!");
		};
		reader.readAsDataURL(file);
	};

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			processFile(file);
			e.target.value = "";
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
		if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragActive(false);
	};
	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
	};
	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragActive(false);
		const file = Array.from(e.dataTransfer.files)[0];
		if (file) processFile(file);
	};

	const handleDeleteImage = () => {
		if (uploadedImage && uploadedImage !== previousImages[0]) {
			setUploadedImage(undefined);
		} else {
			setUploadedImage(null);
		}
		toast.success("Image removed.");
	};

	const convertLinkToBase64 = (url: string): Promise<string> =>
		new Promise((resolve, reject) => {
			const img = new window.Image();
			img.crossOrigin = "Anonymous";
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("Canvas context unavailable"));
					return;
				}
				canvas.width = img.width;
				canvas.height = img.height;
				ctx.drawImage(img, 0, 0);
				resolve(canvas.toDataURL("image/png"));
			};
			img.onerror = () => reject(new Error("Failed to load image"));
			img.src = url;
		});

	const handleUseGeneratedImage = async () => {
		if (!previousImages[0]) return;
		if (previousImages[0].startsWith("data:")) {
			setUploadedImage(previousImages[0]);
			toast.success("Generated image applied!");
			return;
		}
		try {
			setIsConverting(true);
			const base64 = await convertLinkToBase64(previousImages[0]);
			setUploadedImage(base64);
			toast.success("Generated image applied!");
		} catch {
			toast.error("Failed to convert image. Try uploading manually.");
		} finally {
			setIsConverting(false);
		}
	};

	const handleGenerateImage = () => {
		generateToken({ mediaType: "image", prompt: prompt?.toString() || "" });
	};

	const startingIndex = isGeneratingMedia ? 0 : 1;
	const thumbs: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);
	while (thumbs.length < 3) thumbs.push(undefined);

	return (
		<div className="space-y-4">
			{/* AI prompt */}
			<div className="relative">
				<Wand2 size={16} className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" />
				<Textarea
					placeholder="Describe your waifu's appearance… (optional – leave blank for random)"
					className={cn(formElementBaseClass, "pl-10 pr-3 py-3 resize-none tracking-wider overflow-hidden")}
					style={{ height: "auto" }}
					maxLength={3000}
					{...registerForm("prompt")}
				/>
			</div>

			{/* Main image area */}
			<div
				className="w-full aspect-[4/3] min-h-[200px] max-h-[360px] relative"
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				{isGeneratingMedia && (
					<div className="w-full h-full bg-black/50 border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex items-center justify-center">
						<RefreshCw size={16} className="animate-spin text-[#03FF24] mr-2" />
						<p className="text-[#03FF24]">Generating…</p>
					</div>
				)}

				{!isGeneratingMedia && !displayImage && (
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className={cn(
							"w-full h-full border-2 border-dashed rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-[#03FF24]",
							isDragActive
								? "bg-[#03FF24]/10 border-[#03FF24] scale-[1.02]"
								: "bg-black/50 border-[#03FF24]/40 hover:border-[#03FF24] hover:bg-black/70",
						)}
					>
						<UploadCloud size={48} className="mb-2 text-[#03FF24]/70 group-hover:text-[#03FF24] transition-all" />
						<p className="text-sm text-gray-300 group-hover:text-white transition-colors">
							Drag &amp; drop or <span className="text-[#03FF24] font-semibold">click to upload</span>
						</p>
						<p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF, WEBP up to 5MB</p>
					</button>
				)}

				{!isGeneratingMedia && displayImage && (
					<div className="w-full h-full relative rounded-none overflow-hidden bg-black/50 border-2 border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.3)]">
						<Image src={displayImage} alt="Token preview" fill className="object-contain p-2 pixelated-image-render" />
						<button
							type="button"
							onClick={handleDeleteImage}
							disabled={isConverting}
							className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 text-white rounded-none w-6 h-6 flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,0.5)] transition-all hover:scale-110"
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
					className="hidden"
				/>
			</div>

			{/* Thumbnails */}
			<div className="grid grid-cols-3 gap-3">
				{thumbs.map((img, idx) => (
					<button
						type="button"
						// biome-ignore lint/suspicious/noArrayIndexKey: thumbnails are positional
						key={idx}
						onClick={() => img && changeMainImage(idx + 1)}
						disabled={!img}
						className="aspect-square bg-black/50 border-2 border-[#03FF24]/30 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] hover:border-[#03FF24] cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative"
					>
						{img ? (
							<Image src={img} alt="" fill className="object-contain p-1 pixelated-image-render" />
						) : (
							<div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">—</div>
						)}
					</button>
				))}
			</div>

			{/* Actions row */}
			<div className="flex gap-3">
				<Button
					type="button"
					onClick={handleGenerateImage}
					disabled={isGeneratingMedia}
					className="flex-1 bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none uppercase tracking-wider disabled:opacity-50"
				>
					{isGeneratingMedia ? (
						<>
							<RefreshCw size={14} className="mr-2 animate-spin" /> Generating…
						</>
					) : (
						<>
							<RefreshCw size={14} className="mr-2" /> Generate Image
						</>
					)}
				</Button>

				<Button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					variant="outline"
					className="h-10 border-2 border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.2)] font-bold uppercase text-xs px-4"
				>
					Upload
				</Button>

				{!uploadedImage && previousImages.length > 0 && (
					<Button
						type="button"
						onClick={handleUseGeneratedImage}
						disabled={isConverting}
						variant="outline"
						className="h-10 border-2 border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.2)] font-bold uppercase text-xs px-4 disabled:opacity-50"
					>
						{isConverting ? "Converting…" : "Lock Image"}
					</Button>
				)}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Import identity placeholder                                        */
/* ------------------------------------------------------------------ */

function ImportIdentityPlaceholder() {
	const { draft } = useDraft();

	return (
		<FormSection title="Token Identity (Imported)">
			<div className="space-y-3">
				<div className="text-xs text-gray-400 leading-relaxed">
					Importing contract:{" "}
					<span className="text-[#03FF24] font-mono">{draft.importContractAddress || "—"}</span>
				</div>
				{/* TODO: When backend provides token-lookup-by-CA, auto-populate name/symbol/description/image here. */}
				<div className="p-3 bg-[#03FF24]/5 border border-[#03FF24]/20 rounded-none">
					<p className="text-[10px] text-gray-500 uppercase tracking-wider">
						⏳ Token metadata will be resolved from chain after import. You can set agent identity in later
						steps.
					</p>
				</div>
			</div>
		</FormSection>
	);
}

/* ------------------------------------------------------------------ */
/*  Main step                                                          */
/* ------------------------------------------------------------------ */

export function IdentityStep() {
	const { draft } = useDraft();
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	if (draft.mode === "import") {
		return (
			<div className="space-y-6">
				<StepHeader
					title="Identity"
					description="Your imported token's identity will be resolved from on-chain metadata."
				/>
				<ImportIdentityPlaceholder />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<StepHeader
				title="Identity"
				description="Name your waifu, write a description, and choose an image."
			/>

			<div className="grid md:grid-cols-2 gap-6 md:items-start">
				<FormSection title="Image" collapsible={false}>
					{isClient ? <ImageSection /> : <ImagePlaceholder />}
				</FormSection>

				<div>
					<CoinInfoFields idPrefix="wizard" collapsible={false} defaultOpen={true} />
				</div>
			</div>
		</div>
	);
}

function StepHeader({ title, description }: { title: string; description: string }) {
	return (
		<div className="mb-2">
			<h2 className="text-lg font-bold text-[#03FF24] uppercase tracking-wider">{title}</h2>
			<p className="text-xs text-gray-500 mt-1">{description}</p>
		</div>
	);
}

function ImagePlaceholder() {
	return (
		<div className="space-y-4">
			<div className="w-full aspect-[4/3] min-h-[200px] max-h-[360px] bg-black/50 border-2 border-[#03FF24]/40 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex items-center justify-center">
				<p className="text-gray-600 text-sm">Loading…</p>
			</div>
		</div>
	);
}
