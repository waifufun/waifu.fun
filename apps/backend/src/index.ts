import Fastify from "fastify";
import logger from "@autofun/logger";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import tokenRoutes from "./routers/tokens";
import pricesRoutes from "./routers/prices";
import chatRoutes from "./routers/chat";
import dogLogger from "@autofun/dog-logger";

const fastify = Fastify({
  logger: {
    stream: {
      write: (msg: string) => {
        try {
          const logData = JSON.parse(msg);
          dogLogger.info(logData.msg);
        } catch (error) {
          dogLogger.error(`Error parsing Fastify log: ${error}, original message: ${msg}`);
          dogLogger.info(msg);
        }
      },
    },
    level: 'info'
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

fastify.register(tokenRoutes, { prefix: "/tokens" });
fastify.register(pricesRoutes, { prefix: "/prices" });
fastify.register(chatRoutes, { prefix: "/chat" });

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
