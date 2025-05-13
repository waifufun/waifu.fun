import type { FastifyInstance } from "fastify";
import { updateCryptoPrices } from "@autofun/utils";
import redis from "@autofun/redis";

export default async function pricesRoutes(fastify: FastifyInstance) {
	/** Retrieve crypto token prices */
	fastify.post("/", async (request) => {
		const cacheKey = "prices";

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}
		

		const prices = await updateCryptoPrices({ cacheKey });

		return prices;
	});
}
