import Fastify from "fastify";
import logger from "@autofun/logger";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import tokenRoutes from "./routers/tokens";
import pricesRoutes from "./routers/prices";
import checkWalletBalance from "./utils/checkBalance";

const fastify = Fastify({
	loggerInstance: logger,
});

fastify.register(helmet);

fastify.register(cors, {
	allowedHeaders: ["*"],
	origin: "*",
});

fastify.get("/", (_, reply) => {
	reply.send({ hello: "world" });
});

fastify.get("/check-balance", async (_, reply) => {
	try {
		const balance = await checkWalletBalance("0x73f7b1184b5cd361cc0f7654998953e2a251dd58");
		console.log(balance);
		reply.send(balance);
	} catch (error) {
		console.error("Error checking balance:", error);
	}
});

fastify.register(tokenRoutes, { prefix: "/tokens" });
fastify.register(pricesRoutes, { prefix: "/prices" });

const port = 3001;

const start = async () => {
	try {
		await fastify.listen({ port });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};
start();
