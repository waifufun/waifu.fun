import { Codex } from "@codex-data/sdk";
import { CHAINID_TO_CODEX_NETWORK_ID, FALLBACK_PRICES, WETH_ADDRESSES } from "@waifufun/constants";
import logger from "@waifufun/logger";
import redis from "@waifufun/redis";
import { EvmChainIds, SolanaNetworkIds } from "@waifufun/types";
import dotenv from "dotenv";

dotenv.config();

let codexClient: Codex | null = null;

function getCodexClient(): Codex {
	const apiKey = process.env.CODEX_API_KEY;
	if (!apiKey) {
		throw new Error("Missing CODEX_API_KEY in environment variables");
	}
	codexClient ??= new Codex(apiKey);
	return codexClient;
}

export const codex = new Proxy({} as Codex, {
	get(_target, prop, receiver) {
		return Reflect.get(getCodexClient(), prop, receiver);
	},
});

export const updateCryptoPrices = async ({
	cacheKey = "prices",
}: { cacheKey?: string }): Promise<{ solana: number; ethereum: number }> => {
	try {
		const wrappedSol = "So11111111111111111111111111111111111111112";

		const prices = await getCodexClient().queries.getTokenPrices({
			inputs: [
				{
					address: WETH_ADDRESSES[EvmChainIds.EthereumMainnet],
					networkId: CHAINID_TO_CODEX_NETWORK_ID.evm[EvmChainIds.EthereumMainnet] as number,
				},
				{
					address: wrappedSol,
					networkId: CHAINID_TO_CODEX_NETWORK_ID.solana[SolanaNetworkIds.Mainnet] as number,
				},
			],
		});

		const results = prices?.getTokenPrices;
		const solana = results?.find((token) => token?.address.toLowerCase() === wrappedSol.toLowerCase())?.priceUsd;
		const ethereum = results?.find(
			(token) => token?.address.toLowerCase() === WETH_ADDRESSES[EvmChainIds.EthereumMainnet].toLowerCase(),
		)?.priceUsd;

		if (!solana) {
			throw new Error("Failed to determine Solana price, using fallback...");
		}

		if (!ethereum) {
			throw new Error("Failed to determine Ethereum price, using fallback...");
		}

		const resolvedPrices = { solana, ethereum };

		if (!resolvedPrices.solana || !resolvedPrices.ethereum) {
			throw new Error("Missing Solana or Ethereum price...");
		}

		await redis.setex(cacheKey, 2 * 60, JSON.stringify(resolvedPrices));

		return resolvedPrices;
	} catch (e) {
		logger.error(e);
		return FALLBACK_PRICES;
	}
};
