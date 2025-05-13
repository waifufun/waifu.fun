import { EVMRpcProvider, SolanaRpcProvider } from "@autofun/rpc";
import { PublicKey } from "@solana/web3.js";
import { getAddress } from "viem";
import type { SolanaNetworkIds, EvmChainIds } from "@autofun/types";
import type { ParsedAccountData } from "@solana/web3.js";

export async function getTokenBalance({
	chain,
	wallet,
	mintAddress,
	chainId,
}: {
	chain: "solana" | "evm";
	wallet: string;
	mintAddress: string;
	chainId: SolanaNetworkIds | EvmChainIds;
}): Promise<number> {
	if (chain === "evm") {
		const provider = new EVMRpcProvider(chainId as EvmChainIds);
		const checksummedAddress = getAddress(mintAddress);
		const [balanceRaw, decimals] = await Promise.all([
			provider.readErc20Contract(checksummedAddress, "balanceOf", [getAddress(wallet)]),
			provider.readErc20Contract(checksummedAddress, "decimals", []),
		]);
		return Number(balanceRaw) / 10 ** Number(decimals);
	}

	if (chain === "solana") {
		const provider = new SolanaRpcProvider(chainId as SolanaNetworkIds);
		const mint = new PublicKey(mintAddress);
		const owner = new PublicKey(wallet);

		const tokenAccounts = await provider.connection.getTokenAccountsByOwner(owner, {
			mint,
		});

		if (!tokenAccounts.value.length) return 0;

		const accountData = tokenAccounts.value[0]?.account.data;
		const amount = Number(accountData?.readBigUInt64LE(64));

		const decimals = await provider.connection.getParsedAccountInfo(mint).then((info) => {
			const data = (info.value?.data as ParsedAccountData)?.parsed?.info;
			return data?.decimals ?? 6;
		});

		return amount / 10 ** decimals;
	}

	throw new Error("Unsupported chain");
}
