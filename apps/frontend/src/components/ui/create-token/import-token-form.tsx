"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSection, FormHelperText, ValidationMessage } from "./form-section";
import { DeployButton } from "./deploy-button";
import { cn } from "@/lib/utils";
import { useForm, type RegisterOptions } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { importToken } from "@/lib/api";
import { type AddressLike, SolanaNetworkIds, type ITokenLookUp } from "@waifufun/types";
import { useRouter } from "next/navigation";
import { Search, ExternalLink, AlertCircle } from "lucide-react";
type TokenForm = { contractAddress: string };
const validationRules: Record<keyof TokenForm, RegisterOptions<TokenForm>> = {
	contractAddress: {
		required: "Contract address is required",
		pattern: { value: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, message: "Invalid Solana contract address format" },
	},
};
export default function ImportTokenForm() {
	const router = useRouter();
	const formElementBaseClass =
		"bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm font-mono";
	const formLabelBaseClass = "text-xs text-[#71717a] uppercase tracking-wider font-medium";
	const { register, handleSubmit, formState, watch } = useForm<TokenForm>({
		defaultValues: { contractAddress: "" },
		mode: "onChange",
	});
	const contractAddress = watch("contractAddress");
	const mutation = useMutation({
		mutationKey: ["import"],
		mutationFn: importToken,
		onSuccess: (_, v) => {
			toast.success(`Imported: ${watch("contractAddress")}`);
			router.push(`/token/${v.chain}/${v.chainId}/${v.contractAddress}`);
		},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});
	const onSubmit = (data: TokenForm) =>
		mutation.mutate({
			chain: "solana",
			chainId: SolanaNetworkIds.Mainnet,
			contractAddress: data.contractAddress as AddressLike,
		} as ITokenLookUp);
	const shouldDisable = formState.isSubmitting || !formState.isValid || Object.keys(formState.errors).length > 0;
	return (
		<div className="max-w-lg mx-auto space-y-6">
			<FormSection
				title="Import Existing Token"
				description="Add an existing Solana token to our platform"
				icon={<Search size={16} />}
			>
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div>
						<Label htmlFor="contractAddress" className={formLabelBaseClass}>
							Contract Address (CA) <span className="text-red-500">*</span>
						</Label>
						<div className="relative mt-1">
							<Input
								type="text"
								id="contractAddress"
								placeholder="Enter Solana token contract address..."
								className={cn(
									formElementBaseClass,
									"h-12 pl-10",
									formState.errors.contractAddress && "border-red-500",
									formState.isValid && contractAddress && "border-[#00ff87]/50",
								)}
								{...register("contractAddress", validationRules.contractAddress)}
							/>
							<Search
								size={16}
								className={cn(
									"absolute left-3 top-1/2 -translate-y-1/2",
									formState.errors.contractAddress
										? "text-red-400"
										: formState.isValid && contractAddress
											? "text-[#00ff87]"
											: "text-[#52525b]",
								)}
							/>
						</div>
						{formState.errors.contractAddress ? (
							<ValidationMessage message={formState.errors.contractAddress.message} isValid={false} />
						) : contractAddress && formState.isValid ? (
							<ValidationMessage message="Valid Solana address format" isValid={true} />
						) : (
							<FormHelperText>Paste the contract address of an existing Solana token</FormHelperText>
						)}
					</div>
					<DeployButton
						type="submit"
						disabled={shouldDisable || mutation.isPending}
						isLoading={mutation.isPending}
						loadingText="IMPORTING..."
					>
						IMPORT TOKEN
					</DeployButton>
				</form>
			</FormSection>
			<div className="bg-[rgba(0,255,135,0.03)] border border-[rgba(0,255,135,0.1)] rounded-sm p-4">
				<div className="flex items-start gap-3">
					<AlertCircle size={18} className="text-[#00ff87] flex-shrink-0 mt-0.5" />
					<div className="space-y-2">
						<h4 className="text-sm font-semibold text-[#e4e4e7]">What happens when you import?</h4>
						<ul className="text-xs text-[#a1a1aa] space-y-1">
							<li className="flex items-center gap-2">
								<span className="w-1 h-1 bg-[#00ff87] rounded-full" />
								Token metadata is fetched from the blockchain
							</li>
							<li className="flex items-center gap-2">
								<span className="w-1 h-1 bg-[#00ff87] rounded-full" />
								Token is added to our platform for trading
							</li>
							<li className="flex items-center gap-2">
								<span className="w-1 h-1 bg-[#00ff87] rounded-full" />
								No fees or transactions required to import
							</li>
						</ul>
					</div>
				</div>
			</div>
			<div className="flex items-center justify-center gap-4 text-xs">
				<a
					href="https://solscan.io"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-[#71717a] hover:text-[#00ff87]"
				>
					<ExternalLink size={12} />
					Find tokens on Solscan
				</a>
				<span className="text-[#52525b]">•</span>
				<a
					href="https://birdeye.so"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-[#71717a] hover:text-[#00ff87]"
				>
					<ExternalLink size={12} />
					Browse on Birdeye
				</a>
			</div>
		</div>
	);
}
