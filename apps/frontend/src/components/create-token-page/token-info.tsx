import { useState } from "react";
import type { RegisterOptions } from "react-hook-form";
import {
	usePrompt,
	type TokenFormOptions,
	type TokenFormData,
	nameValidation,
	tickerValidation,
	descriptionValidation,
} from "../hooks/providers/usePromptContext";
import { Info, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useWallets } from "../hooks/providers/UseWalletContext";
import { useMutation } from "@tanstack/react-query";
import { createToken } from "@/lib/api";
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";

export const TokenInfoInput = <K extends TokenFormOptions>({
	title,
	label,
	target,
	validation,
}: {
	title: string;
	label?: string;
	target: K;
	validation?: RegisterOptions<TokenFormData, K>;
}) => {
	const {
		registerForm,
		formState: { errors },
	} = usePrompt();
	const error = errors[target];

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

const GenerateAddress = () => {
	const [suffix, setSuffix] = useState<string>("FUN");
	const { generateAddress, mintKeyPair, isGeneratingAddress } = usePrompt();

	return (
		<div className="mt-4">
			<div className="inline-block">
				<p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24]">GENERATE CUSTOM ADDRESS</p>
				<div className="flex gap-4 mt-4">
					<input
						className="rounded-lg py-3 focus:outline-none text-center text-lg w-30 bg-transparent text-white"
						type="text"
						value={suffix}
						onChange={(e) => setSuffix(e.target.value)}
						placeholder="FUN"
						style={{
							background: "linear-gradient(106.96deg, #141414 -24.65%, #131313 48.9%, #121212 109.26%)",
						}}
					/>
					<button
						type="button"
						onClick={(e) => {
							generateAddress(suffix);
							e.preventDefault();
						}}
						className="border border-[#03FF24] rounded-lg hover:cursor-pointer px-4 py-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<p>{isGeneratingAddress ? "GENERATING..." : "GENERATE"}</p>
					</button>
				</div>
			</div>
			<p className="text-[#03FF24] text-sm md:text-md xl:text-lg py-3 break-all min-h-[1em]">
				{mintKeyPair ? mintKeyPair.publicKey.toString() : "GENERATING..."}
			</p>
			<div className="flex items-center gap-2">
				<Info size={14} color="#8C8C8C" />
				<p className="text-[#8C8C8C] text-sm font-[500]">Longer suffixes are slower to generate</p>
			</div>
		</div>
	);
};

const BuyCoin = () => {
	const {
		registerForm,
		formState: { errors },
		setValue,
	} = usePrompt();
	const address = useAddress();
	const balanceQuery = useBalance({
		chain: "solana",
		address,
	});
	const balance = balanceQuery?.data;

	const setMaxAmount = () => {
		if (balance) {
			setValue("buyAmount", balance, { shouldValidate: true, shouldDirty: true });
		}
	};

	return (
		<div className="inline-block py-4">
			<p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24] inline-block">BUY COIN</p>

			<div className="flex gap-8 mt-4 items-center">
				<div className="relative flex gap-2 items-center">
					<p className="text-xl font-[500]">Buy</p>
					<Info size={14} color="#8C8C8C" />
				</div>
				<div
					className={`flex gap-3 items-center py-3 px-4 rounded-lg ${errors.buyAmount ? "border border-red-500" : "border border-transparent"}`}
					style={{
						background: "linear-gradient(180deg, #171717 0%, #141414 100%)",
					}}
				>
					<input
						className="rounded-lg focus:outline-none text-lg w-20 bg-transparent text-white placeholder:text-gray-500"
						type="number"
						step="any"
						{...registerForm("buyAmount", {
							valueAsNumber: true,
							min: { value: 0, message: "Amount cannot be negative" },
							max: { value: Math.min(balance || 0, 28), message: "Amount cannot be greater than your balance or 28" },
						})}
					/>
					<p className="text-xl text-[#03FF24] font-[500]">SOL</p>
				</div>
			</div>
			{errors.buyAmount && <p className="text-red-500 text-sm mt-1">{errors.buyAmount.message}</p>}
			<div className="flex gap-2 items-center py-2">
				<Wallet size={14} color="#8C8C8C" />
				<p className="text-[#8C8C8C] text-sm font-[500]">Balance: {balance} SOL</p>
			</div>
			<button
				onClick={(e) => {
					e.preventDefault();
					setMaxAmount();
				}}
				type="button"
				className="py-2 hover:cursor-pointer"
			>
				<p className="text-[#E3AA00] text-sm font-[500]">Maximum amount based on your balance</p>
			</button>
		</div>
	);
};

const ChoosePool = () => {
	const poolData = [
		{ name: "Meteora", value: "meteora", image: "/pools/meteora.svg" },
		{ name: "Raydium", value: "raydium", image: "/pools/raydium.svg" },
	];
	const { formState, isGeneratingAddress, isGeneratingImage, pool, setPool, isLaunching } = usePrompt();

	const shouldDisable = !formState.isValid || isGeneratingAddress || isGeneratingImage || isLaunching;

	return (
		<div className="flex flex-col gap-4 xl:flex-row xl:justify-between w-full xl:items-center mt-6">
			<div className="flex flex-col xl:flex-row gap-2 items-center">
				<p className="text-xl font-[500] whitespace-nowrap w-full xl:w-auto">Choose Pool</p>
				<div className="flex px-2 py-1 rounded-lg gap-2 w-full" style={{}}>
					{poolData.map((poolIt) => (
						<button
							type="button"
							key={poolIt.value}
							className="flex items-center gap-2 p-2 rounded-lg hover:cursor-pointer"
							onClick={() => setPool(poolIt.value)}
							style={{
								border: poolIt.value === pool ? "1px solid #03FF24" : "1px solid #141414",
								background: "linear-gradient(180deg, #171717 0%, #141414 100%)",
							}}
						>
							<img src={poolIt.image} alt={poolIt.name} className="w-5 h-5" />
							<p className="text-[#8C8C8C] text-base font-[500]">{poolIt.name}</p>
						</button>
					))}
				</div>
			</div>
			<button
				type="submit"
				disabled={shouldDisable}
				style={{
					cursor: !shouldDisable ? "pointer" : "not-allowed",
					background: !shouldDisable
						? "linear-gradient(93.76deg, #03FF24 0%, #00E61E 102.57%)"
						: "linear-gradient(93.76deg, #028A16 0%, #026B12 102.57%)",
				}}
				className="px-6 py-3 rounded-lg min-w-[120px]"
			>
				<p className="text-[#0A0A0A] text-base font-[700]">{isLaunching ? "LAUNCHING..." : "LAUNCH"}</p>
			</button>
		</div>
	);
};

const TokenInfo = ({ type }: { type: "auto" | "manual" }) => {
	const {
		handleSubmit,
		formState,
		uploadedImage,
		isGeneratingAddress,
		isGeneratingImage,
		getTokenData,
		pool,
		mintKeyPair,
		setLaunching,
	} = usePrompt();
	const { solanaWallets } = useWallets();

	const createTokenMutation = useMutation({
		mutationFn: createToken,
		mutationKey: ["createToken"],
		onSuccess: (tx) => {
			console.log("Transaction successful:", tx);
			toast.success("Token created successfully!");
		},
		onError: (error) => {
			console.error("Error creating token:", error);
			toast.error(`Error creating token: ${error.message}`);
		},
	});

	const handleSubmitManual = async () => {
		if (!uploadedImage) {
			toast.error("Please upload an image.");
			return;
		}

		setLaunching(true);

		try {
			const tokenData = await getTokenData(true);
			console.log("Token Data (manual):", tokenData);
			const tx = await solanaWallets?.Devnet.createToken(tokenData);
			console.log("Transaction:", tx);
			createTokenMutation.mutate({
				contractAddress: mintKeyPair?.publicKey.toString() || "",
				chain: "solana",
				chainId: 103,
				pool: pool,
				signature: tx?.signature.toString() || "",
			});
			// biome-ignore lint/suspicious/noExplicitAny: error handling
		} catch (error: any) {
			console.error("Error creating token:", error);
			toast.error(`Error creating token: ${error.message}`);
		} finally {
			setLaunching(false);
		}
	};

	const handleAutoSubmit = async () => {
		setLaunching(true);
		try {
			const tokenData = await getTokenData();
			console.log("Token Data:", tokenData);
			const tx = await solanaWallets?.Devnet.createToken(tokenData);
			console.log("Transaction:", tx);
			createTokenMutation.mutate({
				contractAddress: mintKeyPair?.publicKey.toString() || "",
				chain: "solana",
				chainId: 103,
				pool: pool,
				signature: tx?.signature.toString() || "",
			});
			// biome-ignore lint/suspicious/noExplicitAny: error handling
		} catch (error: any) {
			console.error("Error creating token:", error);
			toast.error(`Error creating token: ${error.message}`);
		} finally {
			setLaunching(false);
		}
	};

	const onSubmit = async (_data: TokenFormData) => {
		if (!solanaWallets?.Devnet) {
			toast.error("Please connect your Solana wallet.");
			return;
		}

		if (!formState.isValid) {
			toast.error("Please fill in all required fields.");
			return;
		}

		if (isGeneratingAddress) {
			toast.error("Please wait for the address to be generated.");
			return;
		}

		if (isGeneratingImage) {
			toast.error("Please wait for the image to be generated.");
			return;
		}

		switch (type) {
			case "auto":
				await handleAutoSubmit();
				break;
			case "manual":
				await handleSubmitManual();
				break;
		}
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)} className="w-full">
			<p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24] inline-block">COIN INFO</p>
			<div className="flex flex-col gap-4 mt-4">
				<div className="flex flex-col md:flex-row md:gap-8 gap-4">
					<TokenInfoInput title="Name" target="name" validation={nameValidation} />
					<TokenInfoInput title="Ticker" label="$" target="symbol" validation={tickerValidation} />
				</div>
				<TokenInfoInput title="Description" target="description" validation={descriptionValidation} />
			</div>
			<GenerateAddress />
			<BuyCoin />
			<ChoosePool />
		</form>
	);
};

export default TokenInfo;
