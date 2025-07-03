import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateTokenSocialsOwner } from "@/lib/api";

interface UpdateSocialsModalProps {
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
	};
	onSuccess?: () => void;
}

export default function UpdateSocialsModal({ open, onClose, token, onSuccess }: UpdateSocialsModalProps) {
	const [form, setForm] = useState({
		twitter: token.socials?.twitter || "",
		telegram: token.socials?.telegram || "",
		discord: token.socials?.discord || "",
		website: token.socials?.website || "",
	});
	const [loading, setLoading] = useState(false);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			await updateTokenSocialsOwner({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				socials: form,
			});
			toast.success("Socials updated successfully");
			onClose();
			onSuccess?.();
		} catch (err) {
			toast.error("Failed to update socials");
		} finally {
			setLoading(false);
		}
	};

	if (!open) return null;

	return (
		<div 
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" 
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					onClose();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div
				className="bg-zinc-900 border border-[#03FF24]/40 shadow-lg w-full max-w-md p-6 relative"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<button
					className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
					onClick={onClose}
					type="button"
					aria-label="Close"
				>
					×
				</button>
				<h2 className="text-lg font-bold mb-4 text-[#03FF24]">Update Token Socials</h2>
				<form onSubmit={handleSubmit} className="space-y-3">
					<Input name="twitter" placeholder="Twitter URL" value={form.twitter} onChange={handleChange} autoFocus />
					<Input name="telegram" placeholder="Telegram URL" value={form.telegram} onChange={handleChange} />
					<Input name="discord" placeholder="Discord URL" value={form.discord} onChange={handleChange} />
					<Input name="website" placeholder="Website URL" value={form.website} onChange={handleChange} />
					<div className="flex justify-end gap-2 mt-4">
						<Button type="button" variant="outline" onClick={onClose} disabled={loading}>
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
