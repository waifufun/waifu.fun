import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import tokenRoutes from "./routers/tokens";
import pricesRoutes from "./routers/prices";
import chatRoutes from "./routers/chat";
import logger from "@autofun/logger";
import transactionsRoutes from "./routers/transaction";

const fastify = Fastify({
	logger: {
		stream: {
			write: (msg: string) => {
				try {
					const logData = JSON.parse(msg);
					logger.info(logData.msg);
				} catch (error) {
					logger.error(`Error parsing Fastify log: ${error}, original message: ${msg}`);
					logger.info(msg);
				}
			},
		},
		level: "info",
	},
});

fastify.register(helmet);

fastify.register(cors, {
	allowedHeaders: ["*"],
	origin: "*",
});

fastify.get("/", (_, reply) => {
	reply.send({ hello: "world" });
});

fastify.addHook("onRequest", async (request, reply) => {
	logger.info(`Request from IP: ${request.ip}`, {
		ip: request.ip,
		url: request.url,
		method: request.method,
	});
});

fastify.register(tokenRoutes, { prefix: "/tokens" });
fastify.register(pricesRoutes, { prefix: "/prices" });
fastify.register(chatRoutes, { prefix: "/chat" });
fastify.register(transactionsRoutes, { prefix: "/transactions" });

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
