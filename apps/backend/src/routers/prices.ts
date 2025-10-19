import type { FastifyInstance } from "fastify";
import { updateCryptoPrices, shouldSkipExternalAPIs } from "@autofun/utils";
import { FALLBACK_PRICES } from "@autofun/constants";
import redis from "@autofun/redis";
import logger from "@autofun/logger";

export default async function pricesRoutes(fastify: FastifyInstance) {
	/** Retrieve crypto token prices */
	fastify.post("/", async (request) => {
		const cacheKey = "prices";

		// On localnet, always return fallback prices without external API calls
		if (shouldSkipExternalAPIs()) {
			logger.info("Localnet detected - returning fallback prices");
			return FALLBACK_PRICES;
		}

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}

		const prices = await updateCryptoPrices({ cacheKey });

		return prices;
	});

	/** Get Jeju ETH price (for localnet compatibility) */
	fastify.post("/jeju", async (request) => {
		// For localnet, return a fixed ETH price
		// In production, this could query Uniswap V4 on Jeju
		if (shouldSkipExternalAPIs()) {
			logger.info("Localnet detected - returning fallback ETH price");
			return { ethereum: FALLBACK_PRICES.ethereum };
		}

		// For production, return the same as the main prices endpoint
		const cacheKey = "prices";
		const cache = await redis.get(cacheKey);
		if (cache) {
			const prices = JSON.parse(cache);
			return { ethereum: prices.ethereum };
		}

		const prices = await updateCryptoPrices({ cacheKey });
		return { ethereum: prices.ethereum };
	});
}
