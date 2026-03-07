import type { FastifyInstance } from "fastify";
import { updateCryptoPrices } from "@waifufun/utils";
import redis from "@waifufun/redis";

export default async function pricesRoutes(fastify: FastifyInstance) {
	/** Retrieve crypto token prices */
	fastify.post("/", async (_request) => {
		const cacheKey = "prices";

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}

		const prices = await updateCryptoPrices({ cacheKey });

		return prices;
	});
}
