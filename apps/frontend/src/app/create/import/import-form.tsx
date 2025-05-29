"use client";

import TokenTypeSelector from "@/components/create-token-page/token-type-selector";
import { importToken } from "@/lib/api";
import { type AddressLike, EvmChainIds, type ITokenLookUp, SolanaNetworkIds, type TChain } from "@autofun/types";
import { useMutation } from "@tanstack/react-query";
import { useForm, type FormState, type RegisterOptions } from "react-hook-form";
import { toast } from "sonner";

// export default function ImportForm() {
// 	const [contractAddress, setContractAddress] = useState<Pick<ITokenLookUp, "contractAddress"> | string>("");
// 	const [chain, setChain] = useState<Omit<ITokenLookUp, "contractAddress">>({
// 		chain: "solana",
// 		chainId: SolanaNetworkIds.Mainnet,
// 	});

// 	const mutation = useMutation({
// 		mutationKey: ["import"],
// 		mutationFn: importToken,
// 		onSuccess: () => {
// 			toast.success(`Imported: ${contractAddress}`);
// 		},
// 		onError: (e) => {
// 			toast.error(`Error: ${e.message}`);
// 		},
// 	});

// 	return (
// 		<div className="flex flex-col gap-4 max-w-md mx-auto py-12">
// 			<div className="flex items-center gap-2">
// 				<Button
// 					variant={chain.chainId === SolanaNetworkIds.Mainnet ? "default" : "secondary"}
// 					onClick={() => {
// 						setChain({
// 							chain: "solana",
// 							chainId: SolanaNetworkIds.Mainnet,
// 						});
// 					}}
// 				>
// 					Solana
// 				</Button>
// 				<Button
// 					variant={chain.chainId === EvmChainIds.BaseMainnet ? "default" : "secondary"}
// 					onClick={() => {
// 						setChain({
// 							chain: "evm",
// 							chainId: EvmChainIds.BaseMainnet,
// 						});
// 					}}
// 				>
// 					Base
// 				</Button>
// 				<Button
// 					variant={chain.chainId === EvmChainIds.EthereumMainnet ? "default" : "secondary"}
// 					onClick={() => {
// 						setChain({
// 							chain: "evm",
// 							chainId: EvmChainIds.EthereumMainnet,
// 						});
// 					}}
// 				>
// 					Ethereum
// 				</Button>
// 			</div>
// 			<Input
// 				placeholder="CA"
// 				onChange={({ target }) => setContractAddress(target.value as unknown as Pick<ITokenLookUp, "contractAddress">)}
// 				value={contractAddress as unknown as string}
// 			/>
// 			<Button
// 				onClick={() => {
// 					if (!contractAddress || !chain?.chain || !chain?.chainId) return;
// 					mutation.mutate({
// 						...chain,
// 						// @ts-ignore
// 						contractAddress,
// 					});
// 				}}
// 				disabled={!contractAddress || mutation?.isPending}
// 			>
// 				Import
// 			</Button>
// 		</div>
// 	);
// }

type TokenForm = {
	contractAddress: string;
	chain: TChain;
	chainId: SolanaNetworkIds | EvmChainIds;
};

type TokenFormOptions = keyof TokenForm;

const TokenImportInput = <K extends TokenFormOptions>({
	title,
	label,
	target,
	validation,
	formState,
	registerForm,
}: {
	title: string;
	label?: string;
	target: K;
	validation?: RegisterOptions<TokenForm, K>;
	formState: FormState<TokenForm>;
	// biome-ignore lint/suspicious/noExplicitAny: use any here
	registerForm: (target: K, validation?: RegisterOptions<TokenForm, K>) => any;
}) => {
	const error = formState.errors[target];

	return (
		<div className="flex flex-col gap-1 w-full">
			<p className="text-xl font-[500]">{title}</p>
			<div
				className={`flex items-center w-full px-4 gap-4 rounded-lg ${error ? "border border-red-500" : "border border-transparent"}`}
				style={{
					background: "linear-gradient(180deg, #171717 0%, #141414 100%)",
				}}
			>
				{label && <p className="text-[#8C8C8C] text-xl font-[500]">{label}</p>}
				<input
					className="w-full rounded-lg py-3 focus:outline-none bg-transparent text-white"
					type="text"
					{...registerForm(target, validation)}
				/>
			</div>
			{error && <p className="text-red-500 text-sm mt-1">{error.message}</p>}
		</div>
	);
};

const ImportButton = ({
	formState,
	onSubmit,
	disabled,
}: {
	formState: FormState<TokenForm>;
	onSubmit: () => void;
	disabled?: boolean;
}) => {
	const shouldDisable = formState.isSubmitting || !formState.isValid || Object.keys(formState.errors).length > 0;

	return (
		<button
			type="submit"
			disabled={shouldDisable || disabled}
			style={{
				cursor: !shouldDisable ? "pointer" : "not-allowed",
				background: !shouldDisable
					? "linear-gradient(93.76deg, #03FF24 0%, #00E61E 102.57%)"
					: "linear-gradient(93.76deg, #028A16 0%, #026B12 102.57%)",
			}}
			className="px-6 py-3 rounded-lg min-w-[120px]"
		>
			<p className="text-[#0A0A0A] text-base font-[700]">LAUNCH</p>
		</button>
	);
};

const validationRules: Record<keyof TokenForm, RegisterOptions<TokenForm>> = {
	contractAddress: {
		required: "Contract address is required",
		pattern: {
			// can be solana or evm address
			value: /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/,
			message: "Invalid contract address format",
		},
	},
	chain: {
		required: "Chain is required",
		validate: (value) => {
			if (value === "solana" || value === "evm") {
				return true;
			}
			return "Invalid chain selected";
		},
	},
	chainId: {
		required: "Chain ID is required",
		validate: (value) => {
			if (
				value === SolanaNetworkIds.Mainnet ||
				value === EvmChainIds.BaseMainnet ||
				value === EvmChainIds.EthereumMainnet
			) {
				return true;
			}
			return "Invalid chain ID selected";
		},
	},
};

const ChainSelector = ({
	chain,
	setChain,
}: {
	chain: {
		chain: TChain;
		chainId: SolanaNetworkIds | EvmChainIds;
	};
	setChain: (chain: { chain: TChain; chainId: SolanaNetworkIds | EvmChainIds }) => void;
}) => {
	return (
		<div
			className="flex items-center gap-2 rounded-lg"
			style={{ background: "linear-gradient(180deg, #171717 0%, #121212 100%)" }}
		>
			<button
				type="button"
				className="hover:cursor-pointer p-2 rounded-lg"
				style={{
					border: chain.chainId === SolanaNetworkIds.Mainnet ? "2px solid #03FF24" : "2px solid transparent",
				}}
				onClick={(e) => {
					setChain({ chain: "solana", chainId: SolanaNetworkIds.Mainnet });
					e.preventDefault();
				}}
			>
				<img src="/chain-icons/solana.svg" alt="Solana" className="w-6 h-6" />
			</button>
			<button
				type="button"
				className="hover:cursor-pointer p-2 rounded-lg"
				style={{
					border: chain.chainId === EvmChainIds.BaseMainnet ? "2px solid #03FF24" : "2px solid transparent",
				}}
				onClick={(e) => {
					setChain({ chain: "evm", chainId: EvmChainIds.BaseMainnet });
					e.preventDefault();
				}}
			>
				<img src="/chain-icons/base.svg" alt="Base" className="w-6 h-6" />
			</button>
			<button
				type="button"
				className="hover:cursor-pointer p-2 rounded-lg"
				style={{
					border: chain.chainId === EvmChainIds.EthereumMainnet ? "2px solid #03FF24" : "2px solid transparent",
				}}
				onClick={(e) => {
					setChain({ chain: "evm", chainId: EvmChainIds.EthereumMainnet });
					e.preventDefault();
				}}
			>
				<img src="/chain-icons/ethereum.svg" alt="Ethereum" className="w-7 h-7" />
			</button>
		</div>
	);
};

export default function ImportFormV2() {
	const { register, handleSubmit, formState, setValue, watch } = useForm<TokenForm>({
		defaultValues: {
			contractAddress: "",
			chain: "solana",
			chainId: SolanaNetworkIds.Mainnet,
		},
		mode: "onChange",
	});

	const setChain = (chain: { chain: TChain; chainId: SolanaNetworkIds | EvmChainIds }) => {
		console.log("Setting chain:", chain);
		setValue("chain", chain.chain);
		setValue("chainId", chain.chainId);
	};

	const currentChain = {
		chain: watch("chain") as TChain,
		chainId: watch("chainId") as SolanaNetworkIds | EvmChainIds,
	};

	const mutation = useMutation({
		mutationKey: ["import"],
		mutationFn: importToken,
		onSuccess: () => {
			toast.success(`Imported: ${watch("contractAddress")}`);
		},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});

	const onSubmit = (data: TokenForm) => {
		console.log("Submitting data:", data);
		if (data.chain === "evm") {
			mutation.mutate({
				chain: data.chain,
				chainId: data.chainId,
				contractAddress: data.contractAddress as AddressLike,
			} as ITokenLookUp);
		} else if (data.chain === "solana") {
			mutation.mutate({
				chain: data.chain,
				chainId: data.chainId,
				contractAddress: data.contractAddress as AddressLike,
			} as ITokenLookUp);
		}
	};

	return (
		<div className="flex justify-center">
			<form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-[1100px]">
				<div className="flex flex-col items-center mt-5 w-full">
					<div>
						<img src="/create/coin-machine.png" alt="coin-machine" />
					</div>
					<div className="rounded-lg bg-[#3333331A] w-full overflow-hidden">
						<TokenTypeSelector selected="import" />
						<div className="p-4 flex items-center min-h-[400px]">
							<div className="mx-auto max-w-[400px] bg-[#0F0F0F] flex flex-col gap-4 w-full">
								<div className="flex justify-between items-center">
									<p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24] inline-block">
										IMPORT TOKEN
									</p>
									<ChainSelector chain={currentChain} setChain={setChain} />
								</div>
								<TokenImportInput
									title="Contract Address"
									target="contractAddress"
									registerForm={register}
									formState={formState}
									validation={validationRules.contractAddress}
								/>
								<ImportButton disabled={mutation.isPending} formState={formState} onSubmit={() => console.log("ewa")} />
							</div>	
						</div>
					</div>
				</div>
			</form>
		</div>
	);
}
