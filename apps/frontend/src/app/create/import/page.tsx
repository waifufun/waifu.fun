"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importToken } from "@/lib/api";
import { type ITokenLookUp, SolanaNetworkIds } from "@autofun/types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export default function Page() {
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
				disabled={!contractAddress}
			>
				Import
			</Button>
		</div>
	);
}
