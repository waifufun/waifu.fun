"use client";
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Image from "next/image";
import { FormSection } from "./form-section";
import { UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
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

const UploadPlaceholder = ({
	onClick,
	isDragActive,
}: {
	onClick: () => void;
	isDragActive: boolean;
}) => {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full h-full border border-dashed rounded-sm flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors group focus:outline-none focus:ring-1 focus:ring-[#00ff87] ${
				isDragActive
					? "bg-[rgba(0,255,135,0.08)] border-[#00ff87]"
					: "bg-[rgba(17,17,20,0.7)] border-[rgba(255,255,255,0.15)] hover:border-[#00ff87] hover:bg-[rgba(17,17,20,0.9)]"
			}`}
			aria-label="Upload image"
		>
			<UploadCloud
				size={48}
				className={`mb-2 transition-colors ${
					isDragActive ? "text-[#00ff87]" : "text-[#00ff87]/70 group-hover:text-[#00ff87]"
				}`}
			/>
			<p
				className={`text-sm transition-colors ${isDragActive ? "text-[#e4e4e7]" : "text-[#a1a1aa] group-hover:text-[#e4e4e7]"}`}
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
	);
};

const ImageUploadSection = () => {
	const { uploadedImage, setUploadedImage, previousImages } = usePrompt();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragActive, setIsDragActive] = useState(false);
	const [isConverting, setIsConverting] = useState(false);

	const displayImage =
		uploadedImage === null ? undefined : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);

	const hasValidImage = Boolean(displayImage);

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

	const handlePlaceholderClick = () => {
		fileInputRef.current?.click();
	};

	const convertLinkToBase64 = (url: string): Promise<string> => {
		return new Promise((resolve, reject) => {
			const img = new window.Image();
			img.crossOrigin = "Anonymous";

			img.onload = () => {
				try {
					const canvas = document.createElement("canvas");
					const ctx = canvas.getContext("2d");

					if (!ctx) {
						reject(new Error("Could not get canvas context"));
						return;
					}

					canvas.width = img.width;
					canvas.height = img.height;

					ctx.drawImage(img, 0, 0);

					const base64 = canvas.toDataURL("image/png");
					resolve(base64);
				} catch (error) {
					reject(error);
				}
			};

			img.onerror = () => {
				reject(new Error("Failed to load image"));
			};

			img.src = url;
		});
	};

	const handleUseGeneratedImage = async () => {
		if (previousImages.length > 0) {
			const imageUrl = previousImages[0];

			// Check if it's already base64
			if (imageUrl?.startsWith("data:")) {
				setUploadedImage(imageUrl);
				toast.success("Generated image applied!");
				return;
			}

			// Convert URL to base64
			if (!imageUrl) {
				toast.error("No image URL available");
				return;
			}

			try {
				setIsConverting(true);
				toast.loading("Converting image...");
				const base64Image = await convertLinkToBase64(imageUrl);
				setUploadedImage(base64Image);
				toast.dismiss();
				toast.success("Generated image applied!");
			} catch (error) {
				toast.dismiss();
				console.error("Failed to convert image to base64:", error);
				toast.error("Failed to convert image. Please try uploading manually.");
			} finally {
				setIsConverting(false);
			}
		}
	};

	const handleDeleteImage = () => {
		if (uploadedImage && uploadedImage !== previousImages[0]) {
			setUploadedImage(undefined);
			toast.success("Manual image removed!");
		} else {
			setUploadedImage(null);
			toast.success("Generated image removed!");
		}
	};

	return (
		<FormSection title="Token Image" className="space-y-4" collapsible={false}>
			<div
				className="w-full h-[240px] relative"
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				{!displayImage && <UploadPlaceholder onClick={handlePlaceholderClick} isDragActive={isDragActive} />}
				{displayImage && (
					<div className="w-full h-full relative rounded-sm overflow-hidden bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)]">
						<Image src={displayImage} alt="Token preview" fill className="object-contain p-2" />
						<button
							type="button"
							onClick={handleDeleteImage}
							disabled={isConverting}
							className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-sm w-6 h-6 flex items-center justify-center transition-colors"
							aria-label="Remove image"
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

			{/* Image status and controls */}
			{displayImage && (
				<div className="flex items-center justify-between">
					<p className="text-xs text-[#71717a]">
						{uploadedImage ? "Manual upload" : "Using generated image"}
						{isConverting && " (Converting...)"}
					</p>
					<div className="flex gap-2">
						{!uploadedImage && previousImages.length > 0 && (
							<button
								type="button"
								onClick={handleUseGeneratedImage}
								disabled={isConverting}
								className="text-xs text-[#00ff87] hover:text-[#e4e4e7] disabled:text-[#52525b] disabled:cursor-not-allowed transition-colors hover:underline"
							>
								{isConverting ? "Converting..." : "Lock Generated Image"}
							</button>
						)}
						<button
							type="button"
							onClick={handlePlaceholderClick}
							disabled={isConverting}
							className="text-xs text-[#00ff87] hover:text-[#e4e4e7] disabled:text-[#52525b] disabled:cursor-not-allowed transition-colors hover:underline"
						>
							Change Image
						</button>
					</div>
				</div>
			)}

			{/* No image notification */}
			{!displayImage && previousImages.length > 0 && (
				<div className="flex items-center justify-between p-2 bg-[rgba(0,255,135,0.08)] border border-[rgba(0,255,135,0.2)] rounded-sm">
					<p className="text-xs text-[#a1a1aa]">Generated image available from Auto tab</p>
					<button
						type="button"
						onClick={handleUseGeneratedImage}
						disabled={isConverting}
						className="text-xs text-[#00ff87] hover:text-[#e4e4e7] disabled:text-[#52525b] disabled:cursor-not-allowed transition-colors hover:underline font-semibold"
					>
						{isConverting ? "Converting..." : "Use Generated Image"}
					</button>
				</div>
			)}

			{/* Image required warning */}
			{!displayImage && previousImages.length === 0 && (
				<div className="p-2 bg-red-500/10 border border-red-500/30 rounded-sm">
					<p className="text-xs text-red-400">
						⚠️ Agent avatar is required. Please upload an image or generate one from the Auto tab.
					</p>
				</div>
			)}
		</FormSection>
	);
};

function ManualCreateForm() {
	const { uploadedImage, previousImages } = usePrompt();

	const hasValidImage = Boolean(
		uploadedImage === null ? false : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined),
	);

	return (
		<div className="grid md:grid-cols-2 gap-6 md:items-start">
			<ImageUploadSection />

			<div className="space-y-6">
				<CoinInfoFields idPrefix="manual" />
				<CustomAddressGenerator idPrefix="manual" />
				<CustomCurveSection />
				<DelayedStartSection />
				<TradeLimitSection />
				<PreBuySection idPrefix="manual" />
				<PoolSelection />
				<LaunchButton idPrefix="manual" disabled={!hasValidImage} />
			</div>
		</div>
	);
}

export default ManualCreateForm;
