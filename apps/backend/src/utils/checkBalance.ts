import { createPublicClient, http, isAddress, formatEther } from "viem";
import { Connection, PublicKey } from "@solana/web3.js";
import { EVM_RPC_URLS, SOLANA_RPC_URLS } from "@autofun/constants";


export default async function checkWalletBalance(
	walletAddress: string,
): Promise<{ blockchain: string; balance: string } | { error: string }> {
	const isEvmAddress = isAddress(walletAddress);
	if (isEvmAddress) {
		const blockchain = "ethereum";
		const alchemyRpcUrl = [EVM_RPC_URLS[1]];
		if (!alchemyRpcUrl) throw new Error("No Alchemy RPC set");
		const ethClient = createPublicClient({
			transport: http(String(alchemyRpcUrl)),
		});
		try {
			const balanceWei = await ethClient.getBalance({ address: walletAddress as `0x${string}` });
			const balance = formatEther(balanceWei);
			return { blockchain, balance };
		} catch (error: any) {
			return { error: `Error fetching Ethereum balance via Alchemy: ${error.message}` };
		}
	} else if (!isEvmAddress) {
		const blockchain = "solana";
		const heliusRpcUrl = [SOLANA_RPC_URLS[101]];
		if (!heliusRpcUrl) throw new Error("No Helius RPC set");
		const solanaConnection = new Connection(String(heliusRpcUrl));
		try {
			const publicKey = new PublicKey(walletAddress);
			const balanceLamports = await solanaConnection.getBalance(publicKey);
			const balance = balanceLamports / 1_000_000_000;
			return { blockchain, balance: balance.toString() };
		} catch (error: any) {
			return { error: `Error fetching Solana balance via Helius: ${error.message}` };
		}
	} else {
		return { error: "Could not identify wallet as ETH or Solana." };
	}
}
