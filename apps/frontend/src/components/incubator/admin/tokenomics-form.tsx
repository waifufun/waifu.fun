"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TokenomicsFormProps {
	formData: {
		totalSupply: string;
		decimals: string;
		presaleAllocation: string;
		liquidityAllocation: string;
		teamAllocation: string;
		marketingAllocation: string;
		developmentAllocation: string;
		communityAllocation: string;
	};
	onInputChangeAction: (formData: FormData) => void;
}

export default function TokenomicsForm({ formData, onInputChangeAction }: TokenomicsFormProps) {
	return (
		<Card className="bg-black border-[#03FF24]/20">
			<CardHeader>
				<CardTitle className="text-[#03FF24]">Tokenomics</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="totalSupply" className="text-white">
							Total Supply
						</Label>
						<Input
							id="totalSupply"
							type="number"
							value={formData.totalSupply}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "totalSupply");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="1000000000"
						/>
					</div>
					<div>
						<Label htmlFor="decimals" className="text-white">
							Decimals
						</Label>
						<Input
							id="decimals"
							type="number"
							value={formData.decimals}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "decimals");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="9"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="presaleAllocation" className="text-white">
							Presale Allocation (%)
						</Label>
						<Input
							id="presaleAllocation"
							type="number"
							value={formData.presaleAllocation}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "presaleAllocation");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="60"
						/>
					</div>
					<div>
						<Label htmlFor="liquidityAllocation" className="text-white">
							Liquidity Allocation (%)
						</Label>
						<Input
							id="liquidityAllocation"
							type="number"
							value={formData.liquidityAllocation}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "liquidityAllocation");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="20"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="teamAllocation" className="text-white">
							Team Allocation (%)
						</Label>
						<Input
							id="teamAllocation"
							type="number"
							value={formData.teamAllocation}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "teamAllocation");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="10"
						/>
					</div>
					<div>
						<Label htmlFor="marketingAllocation" className="text-white">
							Marketing Allocation (%)
						</Label>
						<Input
							id="marketingAllocation"
							type="number"
							value={formData.marketingAllocation}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "marketingAllocation");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
							placeholder="10"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
} 