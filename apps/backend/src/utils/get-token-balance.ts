import { EVMRpcProvider, SolanaRpcProvider } from "@autofun/rpc";
import { PublicKey } from "@solana/web3.js";
import { getAddress } from "viem";
import type { SolanaNetworkIds, EvmChainIds } from "@autofun/types";

export async function getTokenBalance({
	chain,
	wallet,
	mintAddress,
	network,
}: {
	chain: "solana" | "evm";
	wallet: string;
	mintAddress: string;
	network: SolanaNetworkIds | EvmChainIds;
}): Promise<number> {
	if (chain === "evm") {
		const provider = new EVMRpcProvider(network);

		const [balanceRaw, decimals] = await Promise.all([
			provider.readErc20Contract(`0x${mintAddress}`, "balanceOf", [getAddress(wallet)]),
			provider.readErc20Contract(`0x${mintAddress}`, "decimals", []),
		]);

		return Number(balanceRaw) / 10 ** Number(decimals);
	}

	if (chain === "solana") {
		const provider = new SolanaRpcProvider(network);
		const mint = new PublicKey(mintAddress);
		const owner = new PublicKey(wallet);

		const tokenAccounts = await provider.connection.getTokenAccountsByOwner(owner, {
			mint,
		});

		if (!tokenAccounts.value.length) return 0;

		const accountData = tokenAccounts.value[0]?.account.data;
		const amount = Number(accountData?.readBigUInt64LE(64));

		const decimals = await provider.connection.getParsedAccountInfo(mint).then((info) => {
			const data = (info.value?.data as any)?.parsed?.info;
			return data?.decimals ?? 6;
		});

		return amount / 10 ** decimals;
	}

	throw new Error("Unsupported chain");
}
