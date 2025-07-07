"use client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import type { FormState } from "@/components/incubator/types/presale-form";

interface FormActionsProps {
	isLoading: boolean;
	isSuccess: boolean;
	error: string | null;
	onSubmitAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
	onCancelAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
	onSubmitClient?: () => void;
	onCancelClient?: () => void;
	canSubmit: boolean;
}

export default function FormActions({
	isLoading,
	isSuccess,
	error,
	onSubmitAction,
	onCancelAction,
	onSubmitClient,
	onCancelClient,
	canSubmit,
}: FormActionsProps) {
	return (
		<div className="space-y-4">
			{error && (
				<div className="p-4 flex items-center bg-red-500/10 border border-red-500 rounded-md">
					<XCircle className="h-4 w-4 text-red-500 mr-2" />
					<span className="text-red-500">{error}</span>
				</div>
			)}

			{isSuccess && (
				<div className="p-4 flex items-center bg-green-500/10 border border-green-500 rounded-md">
					<CheckCircle className="h-4 w-4 text-green-500 mr-2" />
					<span className="text-green-500">Presale created successfully!</span>
				</div>
			)}

			<div className="flex justify-end gap-4">
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						const formData = new FormData();
						const emptyFormState: FormState = {
							name: "",
							symbol: "",
							description: "",
							image: "",
							website: "",
							telegram: "",
							twitter: "",
							discord: "",
							github: "",
							whitepaper: "",
							contractAddress: "",
							targetAmount: "",
							targetAmountUsd: "",
							pricePerToken: "",
							pricePerTokenUsd: "",
							minimumInvestment: "",
							maximumInvestment: "",
							startDate: "",
							endDate: "",
							claimDate: "",
							presaleAllocation: "",
							liquidityAllocation: "",
							teamAllocation: "",
							marketingAllocation: "",
							developmentAllocation: "",
							communityAllocation: "",
							totalSupply: "",
							decimals: "",
							chain: "",
							chainId: 0,
							currency: "",
							softCap: "",
							hardCap: "",
							vesting: "",
							creator: "",
						};
						onCancelAction(emptyFormState, formData);
						onCancelClient?.();
					}}
					className="border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10"
					disabled={isLoading}
				>
					Cancel
				</Button>
				<Button
					onClick={() => {
						const formData = new FormData();
						const emptyFormState: FormState = {
							name: "",
							symbol: "",
							description: "",
							image: "",
							contractAddress: "",
							targetAmount: "",
							targetAmountUsd: "",
							pricePerToken: "",
							pricePerTokenUsd: "",
							minimumInvestment: "",
							maximumInvestment: "",
							startDate: "",
							endDate: "",
							claimDate: "",
							presaleAllocation: "",
							liquidityAllocation: "",
							teamAllocation: "",
							marketingAllocation: "",
							developmentAllocation: "",
							communityAllocation: "",
							totalSupply: "",
							decimals: "",
							chain: "",
							chainId: 0,
							currency: "",
							softCap: "",
							hardCap: "",
							vesting: "",
							creator: "",
							website: "",
							telegram: "",
							twitter: "",
							discord: "",
							github: "",
							whitepaper: "",
						};
						onSubmitAction(emptyFormState, formData);
						onSubmitClient?.();
					}}
					disabled={isLoading || !canSubmit}
					className="bg-[#03FF24] text-black hover:bg-[#03FF24]/90 disabled:opacity-50"
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Creating Presale...
						</>
					) : (
						"Create Presale"
					)}
				</Button>
			</div>
		</div>
	);
}
