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
		"bg-black border-2 border-[#FF2D78]/60 placeholder-gray-500 text-sm focus:border-[#FF2D78] focus:ring-1 focus:ring-[#FF2D78] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(255,45,120,0.25)]";
	const formLabelBaseClass = "text-xs text-gray-400 uppercase tracking-wider font-semibold";

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
					className="w-full bg-[#FF2D78] hover:bg-[#e6266d] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#b31f57] hover:shadow-[2px_2px_0px_#b31f57] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#b31f57]"
				>
					{mutation.isPending ? "IMPORTING..." : "IMPORT"}
				</Button>
			</form>
		</FormSection>
	);
}
