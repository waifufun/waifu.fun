import Image from "next/image";
import { uploadAvatar } from "@/lib/api";
import type { AddressLike } from "@autofun/types";
import { useRef, useState } from "react";

export default function AvatarImage({ address, image }: { address: AddressLike, image: string }) {
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleUploadClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setImageFile(file);


		const reader = new FileReader();
		reader.onloadend = () => {
			if (reader.result) {
				setPreview(reader.result as string);
			}
		};
		reader.readAsDataURL(file);
	};

	const handleSubmit = async () => {
		if (imageFile) {
			const reader = new FileReader();
			reader.onloadend = async () => {
				const base64String = reader.result as string;
				await uploadAvatar({ address, image: base64String });
			};
			reader.readAsDataURL(imageFile);
		}
	};

	return (
		<div className="border-4 h-fit border-[#03FF24]/60 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.4)] relative w-[150px]">
			<Image src={image || "/create/test-img.png"} alt="Profile" width={150} height={150} className="object-cover" />
			<input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
			<div className="absolute px-2 w-full justify-between top-2 flex gap-2">
				<button
					type="button"
					onClick={handleUploadClick}
					className="cursor-pointer bg-[#0C0C0C]/90 rounded-md p-1 size-6"
				>
					<Image src="/profile/upload.svg" alt="Upload" width={24} height={24} />
				</button>
				<button type="button" onClick={handleSubmit} className="cursor-pointer bg-[#0C0C0C]/90 rounded-md p-1 w-6 h-6">
					<Image src="/profile/rotate.svg" alt="Submit" width={14} height={14} />
				</button>
			</div>
		</div>
	);
}
