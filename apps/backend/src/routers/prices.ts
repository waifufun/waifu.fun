import type { FastifyInstance } from "fastify";
import { codex } from "@autofun/utils";
import { CHAINID_TO_CODEX_NETWORK_ID, WETH_ADDRESSES } from "@autofun/constants";
import { EvmChainIds, SolanaNetworkIds } from "@autofun/types";
import redis from "@autofun/redis";

export default async function pricesRoutes(fastify: FastifyInstance) {
	/** Retrieve crypto token prices */
	fastify.post("/", async (request) => {
		const cacheKey = "prices";

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}
		const wrappedSol = "So11111111111111111111111111111111111111112";

		const prices = await codex.queries.getTokenPrices({
			inputs: [
				/** Ethereum */
				{
					address: WETH_ADDRESSES[EvmChainIds.EthereumMainnet],
					networkId: CHAINID_TO_CODEX_NETWORK_ID.evm[EvmChainIds.EthereumMainnet] as number,
				},
				/** Solana */
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

		const resolvedPrices = { solana, ethereum };

		await redis.setex(cacheKey, 45, JSON.stringify(resolvedPrices));

		return resolvedPrices;
	});
}
