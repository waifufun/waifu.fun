"use client";

import { useState } from "react";

export default function AvatarUploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (data: { image?: string; imageUrl?: string }) => void }) {
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imageUrl, setImageUrl] = useState("");

	const handleSubmit = async () => {
		if (imageFile) {
			const reader = new FileReader();
			reader.onloadend = () => {
				const base64String = reader.result as string;
				onUpload({ image: base64String });
			};
			reader.readAsDataURL(imageFile);
		} else if (imageUrl) {
			onUpload({ imageUrl });
		}
		onClose();
	};

	return (
			<div className="bg-black p-6 rounded-lg w-full max-w-md">
				<h2 className="text-xl font-semibold mb-4">Upload Avatar</h2>

				<div className="mb-4">
					<input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
				</div>

				<div className="mb-4">
					<input
						type="text"
						className="w-full border border-gray-300 rounded px-3 py-2"
						value={imageUrl}
						onChange={(e) => setImageUrl(e.target.value)}
					/>
				</div>

				<div className="flex justify-end space-x-2">
					<button type="button" className="px-4 py-2 text-sm bg-gray-300 rounded" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="px-4 py-2 text-sm bg-blue-600 text-white rounded" onClick={handleSubmit}>
						Upload
					</button>
				</div>
			</div>
	);
}
