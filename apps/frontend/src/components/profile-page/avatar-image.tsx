import Image from "next/image";
import { uploadAvatar } from "@/lib/api";
import type { AddressLike } from "@autofun/types";
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AvatarImage({ address, image }: { address: AddressLike; image: string }) {
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
	const queryClient = useQueryClient();
	const submitAvatarMutation = useMutation({
		mutationFn: async (imageFile: File) => {
			const reader = new FileReader();

			return new Promise<void>((resolve, reject) => {
				reader.onloadend = async () => {
					try {
						const base64String = reader.result as string;
						await uploadAvatar({ address, image: base64String });
						resolve();
					} catch (error) {
						reject(error);
					}
				};
				reader.readAsDataURL(imageFile);
			});
		},
		mutationKey: ["upload-avatar"],
		onSuccess: () => {
			setPreview(null);
			setImageFile(null);
			toast.success("Avatar image successfully changed");
			queryClient.invalidateQueries({ queryKey: ["user", address] });
		},
		onError: () => {
			toast.error("Something went wrong");
		},
	});

	return (
		<div className="border-4 h-fit border-[#03FF24]/60 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.4)] relative w-[150px]">
			<Image
				src={preview || image || "/create/test-img.png"}
				alt="Profile"
				width={150}
				height={150}
				unoptimized
				className="object-cover"
			/>
			<input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
			<div className="absolute px-2 w-full justify-between top-2 flex gap-2">
				<button type="button" onClick={handleUploadClick} className="cursor-pointer bg-[#0C0C0C]/90 p-1 size-6">
					<Image src="/profile/upload.svg" alt="Upload" width={24} height={24} />
				</button>
				{preview && preview !== image && (
					<button
						type="button"
						onClick={() => imageFile && submitAvatarMutation.mutate(imageFile)}
						className="bg-[#0C0C0C]/90 cursor-pointer p-1 w-6 h-6"
					>
						<Check className="text-[#03FF24]" width={14} height={14} />
					</button>
				)}
			</div>
		</div>
	);
}
