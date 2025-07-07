"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SocialLinksFormProps {
	formData: {
		website: string;
		telegram: string;
		twitter: string;
		discord: string;
		github: string;
		whitepaper: string;
	};
	onInputChangeAction: (formData: FormData) => void;
}

export default function SocialLinksForm({ formData, onInputChangeAction }: SocialLinksFormProps) {
	return (
		<Card className="bg-black border-[#03FF24]/20">
			<CardHeader>
				<CardTitle className="text-[#03FF24]">Social Links</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="website" className="text-white">
							Website
						</Label>
						<Input
							id="website"
							value={formData.website}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "website");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://example.com"
						/>
					</div>
					<div>
						<Label htmlFor="telegram" className="text-white">
							Telegram
						</Label>
						<Input
							id="telegram"
							value={formData.telegram}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "telegram");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://t.me/project"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="twitter" className="text-white">
							Twitter
						</Label>
						<Input
							id="twitter"
							value={formData.twitter}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "twitter");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://twitter.com/project"
						/>
					</div>
					<div>
						<Label htmlFor="discord" className="text-white">
							Discord
						</Label>
						<Input
							id="discord"
							value={formData.discord}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "discord");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://discord.gg/project"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="github" className="text-white">
							GitHub
						</Label>
						<Input
							id="github"
							value={formData.github}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "github");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://github.com/project"
						/>
					</div>
					<div>
						<Label htmlFor="whitepaper" className="text-white">
							Whitepaper
						</Label>
						<Input
							id="whitepaper"
							value={formData.whitepaper}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "whitepaper");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="https://example.com/whitepaper.pdf"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
