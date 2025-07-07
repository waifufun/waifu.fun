"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FundingFormProps {
	formData: {
		targetAmount: string;
		targetAmountUsd: string;
		pricePerToken: string;
		pricePerTokenUsd: string;
		minimumInvestment: string;
		maximumInvestment: string;
		softCap: string;
		hardCap: string;
	};
	onInputChangeAction: (formData: FormData) => void;
}

export default function FundingForm({ formData, onInputChangeAction }: FundingFormProps) {
	return (
		<Card className="bg-black border-[#03FF24]/20">
			<CardHeader>
				<CardTitle className="text-[#03FF24]">Funding Details</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="targetAmount" className="text-white">
							Target Amount (SOL)
						</Label>
						<Input
							id="targetAmount"
							type="number"
							value={formData.targetAmount}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "targetAmount");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="1000"
						/>
					</div>
					<div>
						<Label htmlFor="softCap" className="text-white">
							Soft Cap (SOL)
						</Label>
						<Input
							id="softCap"
							type="number"
							value={formData.softCap}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "softCap");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="500"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="pricePerToken" className="text-white">
							Price per Token (SOL)
						</Label>
						<Input
							id="pricePerToken"
							type="number"
							step="0.000000001"
							value={formData.pricePerToken}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "pricePerToken");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="0.001"
						/>
					</div>
					<div>
						<Label htmlFor="pricePerTokenUsd" className="text-white">
							Price per Token (USD)
						</Label>
						<Input
							id="pricePerTokenUsd"
							type="number"
							step="0.01"
							value={formData.pricePerTokenUsd}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "pricePerTokenUsd");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="0.10"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="minimumInvestment" className="text-white">
							Minimum Investment (SOL)
						</Label>
						<Input
							id="minimumInvestment"
							type="number"
							value={formData.minimumInvestment}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "minimumInvestment");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="0.1"
						/>
					</div>
					<div>
						<Label htmlFor="maximumInvestment" className="text-white">
							Maximum Investment (SOL)
						</Label>
						<Input
							id="maximumInvestment"
							type="number"
							value={formData.maximumInvestment}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "maximumInvestment");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="100"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
