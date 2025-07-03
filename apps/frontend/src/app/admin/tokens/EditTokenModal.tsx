import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import React, { useState } from "react";

interface EditTokenModalProps {
	open: boolean;
	onClose: () => void;
	token: {
		chain: string;
		chainId: string;
		contractAddress: string;
		socials?: {
			twitter?: string;
			telegram?: string;
			discord?: string;
			website?: string;
		};
		description?: string;
	};
	onSave: (
		socials: { twitter?: string; telegram?: string; discord?: string; website?: string },
		description: string,
	) => Promise<void>;
	loading: boolean;
}

export default function EditTokenModal({ open, onClose, token, onSave, loading }: EditTokenModalProps) {
	const [form, setForm] = useState({
		twitter: token.socials?.twitter || "",
		telegram: token.socials?.telegram || "",
		discord: token.socials?.discord || "",
		website: token.socials?.website || "",
		description: token.description || "",
	});

	React.useEffect(() => {
		setForm({
			twitter: token.socials?.twitter || "",
			telegram: token.socials?.telegram || "",
			discord: token.socials?.discord || "",
			website: token.socials?.website || "",
			description: token.description || "",
		});
	}, [token]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		await onSave(
			{
				twitter: form.twitter,
				telegram: form.telegram,
				discord: form.discord,
				website: form.website,
			},
			form.description,
		);
	};

	if (!open) return null;

	return (
		<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
			<div className="bg-card p-6  w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
				<h2 className="text-xl font-bold mb-2">Edit Token</h2>
				<form onSubmit={handleSubmit}>
					<div className="mb-2">
						<label htmlFor="twitter" className="block text-sm font-medium mb-1">
							Twitter
						</label>
						<Input id="twitter" name="twitter" value={form.twitter} onChange={handleChange} />
					</div>
					<div className="mb-2">
						<label htmlFor="telegram" className="block text-sm font-medium mb-1">
							Telegram
						</label>
						<Input id="telegram" name="telegram" value={form.telegram} onChange={handleChange} />
					</div>
					<div className="mb-2">
						<label htmlFor="discord" className="block text-sm font-medium mb-1">
							Discord
						</label>
						<Input id="discord" name="discord" value={form.discord} onChange={handleChange} />
					</div>
					<div className="mb-2">
						<label htmlFor="website" className="block text-sm font-medium mb-1">
							Website
						</label>
						<Input id="website" name="website" value={form.website} onChange={handleChange} />
					</div>
					<div className="mb-2">
						<label htmlFor="description" className="block text-sm font-medium mb-1">
							Description
						</label>
						<textarea
							id="description"
							name="description"
							className="w-full border p-2 bg-zinc-900 text-white min-h-[80px]"
							value={form.description}
							onChange={handleChange}
						/>
					</div>
					<div className="flex gap-2 justify-end mt-4">
						<Button variant="outline" type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={loading}>
							{loading ? "Saving..." : "Save"}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
