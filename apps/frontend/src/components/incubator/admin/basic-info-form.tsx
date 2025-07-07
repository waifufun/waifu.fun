"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/create-token/textarea";

interface BasicInfoFormProps {
	formData: {
		name: string;
		symbol: string;
		description: string;
		image: string;
		contractAddress: string;
		creator: string;
	};
	onInputChangeAction: (formData: FormData) => void;
}

export default function BasicInfoForm({ formData, onInputChangeAction }: BasicInfoFormProps) {
	return (
		<Card className="bg-black border-[#03FF24]/20">
			<CardHeader>
				<CardTitle className="text-[#03FF24]">Basic Information</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="name" className="text-white">
							Project Name
						</Label>
						<Input
							id="name"
							value={formData.name}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "name");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="Enter project name"
						/>
					</div>
					<div>
						<Label htmlFor="symbol" className="text-white">
							Token Symbol
						</Label>
						<Input
							id="symbol"
							value={formData.symbol}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "symbol");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="e.g., TOKEN"
						/>
					</div>
				</div>
				<div>
					<Label htmlFor="description" className="text-white">
						Description
					</Label>
					<Textarea
						id="description"
						value={formData.description}
						onChange={(e) => {
							const formData = new FormData();
							formData.append("field", "description");
							formData.append("value", e.target.value);
							onInputChangeAction(formData);
						}}
						className="bg-black border-[#03FF24]/20 text-white min-h-[100px]"
						placeholder="Describe your project..."
					/>
				</div>
				<div>
					<Label htmlFor="image" className="text-white">
						Project Image URL
					</Label>
					<Input
						id="image"
						value={formData.image}
						onChange={(e) => {
							const formData = new FormData();
							formData.append("field", "image");
							formData.append("value", e.target.value);
							onInputChangeAction(formData);
						}}
						className="bg-black border-[#03FF24]/20 text-white"
						placeholder="https://example.com/image.png"
					/>
				</div>
				<div>
					<Label htmlFor="contractAddress" className="text-white">
						Contract Address
					</Label>
					<Input
						id="contractAddress"
						value={formData.contractAddress}
						onChange={(e) => {
							const formData = new FormData();
							formData.append("field", "contractAddress");
							formData.append("value", e.target.value);
							onInputChangeAction(formData);
						}}
						className="bg-black border-[#03FF24]/20 text-white"
						placeholder="Enter token contract address"
					/>
				</div>
				<div>
					<Label htmlFor="creator" className="text-white">
						Creator Address
					</Label>
					<Input
						id="creator"
						value={formData.creator}
						onChange={(e) => {
							const formData = new FormData();
							formData.append("field", "creator");
							formData.append("value", e.target.value);
							onInputChangeAction(formData);
						}}
						className="bg-black border-[#03FF24]/20 text-white"
						placeholder="Enter creator wallet address"
					/>
				</div>
			</CardContent>
		</Card>
	);
}
