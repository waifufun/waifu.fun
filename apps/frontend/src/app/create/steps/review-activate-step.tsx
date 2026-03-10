"use client";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/create-token/form-section";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { useDraft } from "../draft-context";
import { useMutation } from "@tanstack/react-query";
import { createToken, importToken } from "@/lib/api";
import { createTokenTx } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";
import type { AddressLike, TChain, ITokenLookUp } from "@autofun/types";
import { SolanaNetworkIds } from "@autofun/types";
import { getErrorMessage } from "@/lib/errorMessage";
import { Rocket, Download, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Summary row                                                        */
/* ------------------------------------------------------------------ */

function SummaryRow({
	label,
	value,
	mono = false,
}: { label: string; value: string | number; mono?: boolean }) {
	return (
		<div className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
			<span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
				{label}
			</span>
			<span
				className={`text-sm text-gray-200 ${mono ? "font-mono text-xs" : ""} max-w-[60%] truncate text-right`}
			>
				{value || "—"}
			</span>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Create Review                                                      */
/* ------------------------------------------------------------------ */

function CreateReview() {
	const wallet = useWallet();
	const { connection } = useConnection();
	const router = useRouter();
	const {
		watchValue,
		formState,
		uploadedImage,
		previousImages,
		isGeneratingAddress,
		isGeneratingMedia,
		getTokenData,
		pool,
		mintKeyPair,
		setLaunching,
		setMintKeyPair,
		isLaunching,
	} = usePrompt();

	const [chain, chainId] = [
		"solana",
		process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 103 : 101,
	];

	const balanceQuery = useBalance({
		chain: "solana",
		address: (wallet?.publicKey?.toString() || "") as AddressLike,
	});
	const balance = balanceQuery?.data || 0;

	const createTokenMutation = useMutation({
		mutationFn: createToken,
		mutationKey: ["createToken"],
		onSuccess: (_, variables) => {
			toast.success("Token created successfully!");
			router.push(`/token/${chain}/${chainId}/${variables.contractAddress}`);
			setMintKeyPair(null);
		},
		onError: (error) => {
			const message = getErrorMessage(error);
			toast.error(`Error creating token: ${message}`);
		},
	});

	const hasImage = Boolean(
		uploadedImage === null
			? false
			: uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined),
	);

	const shouldDisable =
		!formState.isValid ||
		isGeneratingAddress ||
		isGeneratingMedia ||
		isLaunching ||
		!mintKeyPair ||
		!hasImage;

	const name = (watchValue("name") as string) || "";
	const symbol = (watchValue("symbol") as string) || "";
	const description = (watchValue("description") as string) || "";
	const buyAmount = (watchValue("buyAmount") as number) || 0;
	const curveLimit = (watchValue("curveLimit") as number) || 0;
	const delayForTrade = (watchValue("delayForTrade") as number) || 0;
	const tradeLimitSol = (watchValue("tradeLimitSol") as number) || 0;

	const onLaunch = async () => {
		if (!formState.isValid) {
			toast.error("Please fill in all required fields.");
			return;
		}
		if (!mintKeyPair) {
			toast.error("Please generate a custom address first.");
			return;
		}
		if (!hasImage) {
			toast.error("Please add an image for your token.");
			return;
		}
		if (balance < 0.04) {
			toast.error("Insufficient balance. You need at least 0.04 SOL.");
			return;
		}

		setLaunching(true);
		try {
			const tokenData = await getTokenData(Boolean(uploadedImage));
			const tx = await createTokenTx(tokenData, { connection, wallet });
			createTokenMutation.mutate({
				contractAddress: mintKeyPair.publicKey.toString(),
				chain: chain as TChain,
				chainId,
				pool,
				signature: tx?.signature.toString() || "",
			});
		} catch (error) {
			const message = getErrorMessage(error);
			toast.error(`Error creating token: ${message}`);
		} finally {
			setLaunching(false);
		}
	};

	return (
		<div className="space-y-6">
			<FormSection title="Token Summary">
				<div className="space-y-0">
					<SummaryRow label="Name" value={name} />
					<SummaryRow label="Ticker" value={symbol ? `$${symbol}` : ""} />
					<SummaryRow label="Description" value={description} />
					<SummaryRow
						label="Address"
						value={mintKeyPair?.publicKey.toString() || "Generating…"}
						mono
					/>
					<SummaryRow label="Image" value={hasImage ? "✓ Set" : "✗ Missing"} />
				</div>
			</FormSection>

			<FormSection title="Configuration">
				<div className="space-y-0">
					<SummaryRow label="Curve Limit" value={`${curveLimit} SOL`} />
					<SummaryRow label="Pool" value={pool.toUpperCase()} />
					<SummaryRow
						label="Delayed Start"
						value={delayForTrade === 0 ? "Instant" : `${delayForTrade}s`}
					/>
					<SummaryRow
						label="Trade Limit"
						value={tradeLimitSol === 0 ? "None" : `${tradeLimitSol} SOL`}
					/>
					<SummaryRow
						label="Pre-buy"
						value={buyAmount === 0 ? "None" : `${buyAmount} SOL`}
					/>
				</div>
			</FormSection>

			{!formState.isValid && (
				<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-none">
					<AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
					<p className="text-xs text-red-400">
						Some required fields are missing. Go back to fix them.
					</p>
				</div>
			)}

			{balance < 0.04 && (
				<div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-none">
					<AlertTriangle size={14} className="text-yellow-400 flex-shrink-0" />
					<p className="text-xs text-yellow-400">
						Insufficient balance ({balance.toFixed(4)} SOL). You need at least 0.04
						SOL.
					</p>
				</div>
			)}

			<Button
				type="button"
				onClick={onLaunch}
				disabled={shouldDisable}
				className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-lg py-3 h-auto rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#01a718]"
			>
				<Rocket size={18} className="mr-2" />
				{isLaunching ? "LAUNCHING…" : "LAUNCH TOKEN"}
			</Button>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Import Review                                                      */
/* ------------------------------------------------------------------ */

function ImportReview() {
	const { draft } = useDraft();
	const router = useRouter();

	const isValidCA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(draft.importContractAddress);

	const mutation = useMutation({
		mutationKey: ["importToken"],
		mutationFn: importToken,
		onSuccess: (_, variables) => {
			toast.success(`Token imported: ${draft.importContractAddress.slice(0, 8)}…`);
			router.push(
				`/token/${variables.chain}/${variables.chainId}/${variables.contractAddress}`,
			);
		},
		onError: (e) => {
			toast.error(`Import error: ${e.message}`);
		},
	});

	const onImport = () => {
		if (!isValidCA) {
			toast.error("Please enter a valid Solana contract address.");
			return;
		}
		mutation.mutate({
			chain: "solana",
			chainId: SolanaNetworkIds.Mainnet,
			contractAddress: draft.importContractAddress as AddressLike,
		} as ITokenLookUp);
	};

	return (
		<div className="space-y-6">
			<FormSection title="Import Summary">
				<div className="space-y-0">
					<SummaryRow
						label="Contract Address"
						value={draft.importContractAddress}
						mono
					/>
					<SummaryRow label="Chain" value="Solana" />
					<SummaryRow
						label="Network"
						value={
							process.env.NEXT_PUBLIC_NETWORK === "devnet"
								? "Devnet"
								: "Mainnet"
						}
					/>
				</div>
			</FormSection>

			{!isValidCA && (
				<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-none">
					<AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
					<p className="text-xs text-red-400">
						Invalid or missing contract address. Go back to the Token step.
					</p>
				</div>
			)}

			<Button
				type="button"
				onClick={onImport}
				disabled={!isValidCA || mutation.isPending}
				className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-lg py-3 h-auto rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#01a718]"
			>
				<Download size={18} className="mr-2" />
				{mutation.isPending ? "IMPORTING…" : "IMPORT TOKEN"}
			</Button>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main step                                                          */
/* ------------------------------------------------------------------ */

export function ReviewActivateStep() {
	const { draft } = useDraft();

	return (
		<div className="space-y-6">
			<div className="mb-2">
				<h2 className="text-lg font-bold text-[#03FF24] uppercase tracking-wider">
					Review &amp; Activate
				</h2>
				<p className="text-xs text-gray-500 mt-1">
					{draft.mode === "import"
						? "Confirm the details and import your token."
						: "Review your configuration and launch your token on-chain."}
				</p>
			</div>

			{draft.mode === "import" ? <ImportReview /> : <CreateReview />}
		</div>
	);
}
