"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSection } from "./form-section";
import { useAnimation } from "@/providers/animation-context";
import { cn } from "@/lib/utils";
import { useForm, type RegisterOptions } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { importToken } from "@/lib/api";
import { type AddressLike, SolanaNetworkIds, type ITokenLookUp } from "@waifufun/types";
import { useRouter } from "next/navigation";

type TokenForm = {
	contractAddress: string;
};

const validationRules: Record<keyof TokenForm, RegisterOptions<TokenForm>> = {
	contractAddress: {
		required: "Contract address is required",
		pattern: {
			// Solana address pattern
			value: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
			message: "Invalid Solana contract address format",
		},
	},
};

export default function ImportTokenForm() {
	const router = useRouter();
	const { animationLevel } = useAnimation();
	const formElementBaseClass =
		"bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm";
	const formLabelBaseClass = "text-xs text-[#71717a] uppercase tracking-wider font-medium";

	const { register, handleSubmit, formState, watch } = useForm<TokenForm>({
		defaultValues: {
			contractAddress: "",
		},
		mode: "onChange",
	});

	const mutation = useMutation({
		mutationKey: ["import"],
		mutationFn: importToken,
		onSuccess: (_, variables) => {
			toast.success(`Imported: ${watch("contractAddress")}`);
			router.push(`/token/${variables.chain}/${variables.chainId}/${variables.contractAddress}`);
		},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});

	const onSubmit = (data: TokenForm) => {
		console.log("Submitting data:", data);
		mutation.mutate({
			chain: "solana",
			chainId: SolanaNetworkIds.Mainnet, // Always Solana Mainnet
			contractAddress: data.contractAddress as AddressLike,
		} as ITokenLookUp);
	};

	const shouldDisable = formState.isSubmitting || !formState.isValid || Object.keys(formState.errors).length > 0;

	return (
		<FormSection title="Import Token" className="max-w-md mx-auto">
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<Label htmlFor="contractAddress" className={formLabelBaseClass}>
						Contract Address (CA)
					</Label>
					<Input
						type="text"
						id="contractAddress"
						placeholder="Enter Solana token contract address"
						className={cn(
							formElementBaseClass,
							"mt-1 h-11",
							formState.errors.contractAddress && "border-red-500 focus:border-red-500",
						)}
						{...register("contractAddress", validationRules.contractAddress)}
					/>
					{formState.errors.contractAddress && (
						<p className="text-red-500 text-xs mt-1">{formState.errors.contractAddress.message}</p>
					)}
				</div>

				<Button
					type="submit"
					disabled={shouldDisable || mutation.isPending}
					className="w-full bg-[#00ff87] hover:bg-[#22c55e] text-[#08080a] font-bold text-sm h-10 rounded-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{mutation.isPending ? "IMPORTING..." : "IMPORT"}
				</Button>
			</form>
		</FormSection>
	);
}
