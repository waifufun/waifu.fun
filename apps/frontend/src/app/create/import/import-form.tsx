"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importToken } from "@/lib/api";
import { EvmChainIds, type ITokenLookUp, SolanaNetworkIds } from "@autofun/types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export default function ImportForm() {
	const [contractAddress, setContractAddress] = useState<Pick<ITokenLookUp, "contractAddress"> | string>("");
	const [chain, setChain] = useState<Omit<ITokenLookUp, "contractAddress">>({
		chain: "solana",
		chainId: SolanaNetworkIds.Mainnet,
	});

	const mutation = useMutation({
		mutationKey: ["import"],
		mutationFn: importToken,
		onSuccess: () => {
			toast.success(`Imported: ${contractAddress}`);
		},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});

	return (
		<div className="flex flex-col gap-4 max-w-md mx-auto py-12">
			<div className="flex items-center gap-2">
				<Button
					variant={chain.chainId === SolanaNetworkIds.Mainnet ? "default" : "secondary"}
					onClick={() => {
						setChain({
							chain: "solana",
							chainId: SolanaNetworkIds.Mainnet,
						});
					}}
				>
					Solana
				</Button>
				<Button
					variant={chain.chainId === EvmChainIds.BaseMainnet ? "default" : "secondary"}
					onClick={() => {
						setChain({
							chain: "evm",
							chainId: EvmChainIds.BaseMainnet,
						});
					}}
				>
					Base
				</Button>
				<Button
					variant={chain.chainId === EvmChainIds.EthereumMainnet ? "default" : "secondary"}
					onClick={() => {
						setChain({
							chain: "evm",
							chainId: EvmChainIds.EthereumMainnet,
						});
					}}
				>
					Ethereum
				</Button>
			</div>
			<Input
				placeholder="CA"
				onChange={({ target }) => setContractAddress(target.value as unknown as Pick<ITokenLookUp, "contractAddress">)}
				value={contractAddress as unknown as string}
			/>
			<Button
				onClick={() => {
					if (!contractAddress || !chain?.chain || !chain?.chainId) return;
					mutation.mutate({
						...chain,
						// @ts-ignore
						contractAddress,
					});
				}}
				disabled={!contractAddress || mutation?.isPending}
			>
				Import
			</Button>
		</div>
	);
}
