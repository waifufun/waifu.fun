"use client";
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Image from "next/image";
import { FormSection } from "./form-section";
import { UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
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
			className={`w-full h-full border-2 border-dashed rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-[#03FF24] ${
				isDragActive
					? "bg-[#03FF24]/10 border-[#03FF24] scale-[1.02]"
					: "bg-black/50 border-[#03FF24]/40 hover:border-[#03FF24] hover:bg-black/70"
			}`}
			aria-label="Upload image"
		>
			<UploadCloud
				size={48}
				className={`mb-2 transition-all ${
					isDragActive ? "text-[#03FF24] scale-110" : "text-[#03FF24]/70 group-hover:text-[#03FF24]"
				}`}
			/>
			<p
				className={`text-sm transition-colors ${isDragActive ? "text-white" : "text-gray-300 group-hover:text-white"}`}
			>
				{isDragActive ? (
					"Drop your image here"
				) : (
					<>
						Drag & drop an image or <span className="text-[#03FF24] font-semibold">click to upload</span>
					</>
				)}
			</p>
			<p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF, WEBP up to 5MB. Recommended: Square, pixel art.</p>
		</button>
	);
};

const ImageUploadSection = () => {
	const { uploadedImage, setUploadedImage } = usePrompt();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragActive, setIsDragActive] = useState(false);

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

	const handleDeleteImage = () => {
		setUploadedImage(undefined);
		toast.success("Image removed!");
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
				{!uploadedImage && <UploadPlaceholder onClick={handlePlaceholderClick} isDragActive={isDragActive} />}
				{uploadedImage && (
					<div className="w-full h-full relative rounded-none overflow-hidden bg-black/50 border-2 border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.3)]">
						<Image
							src={uploadedImage}
							alt="Uploaded preview"
							fill
							className="object-contain p-2 pixelated-image-render"
						/>
						<button
							type="button"
							onClick={handleDeleteImage}
							className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-none w-6 h-6 flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,0.5)] transition-all hover:scale-110"
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
			{uploadedImage && (
				<div className="flex items-center justify-between">
					<p className="text-xs text-gray-400">Image uploaded successfully</p>
					<button
						type="button"
						onClick={handlePlaceholderClick}
						className="text-xs text-[#03FF24] hover:text-white transition-colors hover:underline"
					>
						Change Image
					</button>
				</div>
			)}
		</FormSection>
	);
};

function ManualCreateForm() {
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
				<LaunchButton />
			</div>
		</div>
	);
}

export default function WrappedManual() {
	return (
		<PromptProvider>
			<ManualCreateForm />
		</PromptProvider>
	);
}
