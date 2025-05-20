import Fastify from "fastify";
import logger from "@autofun/logger";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import tokenRoutes from "./routers/tokens";
import pricesRoutes from "./routers/prices";
import chatRoutes from "./routers/chat";
import transactionsRoutes from "./routers/transaction";
import authRoutes from "./routers/auth";
import fastifyJWT from "@fastify/jwt";

const fastify = Fastify({
	loggerInstance: logger,
});


if (!process.env.JWT_SECRET) {
	throw new Error("JWT_SECRET is not set in process.env");
}

fastify.register(helmet);

fastify.register(cors, {
	allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	origin: "http://localhost:3000",
	credentials: true,
});

fastify.register(fastifyJWT, {
  secret: process.env.JWT_SECRET
})

fastify.get("/", (_, reply) => {
	reply.send({ hello: "world" });
});

fastify.register(tokenRoutes, { prefix: "/tokens" });
fastify.register(pricesRoutes, { prefix: "/prices" });
fastify.register(chatRoutes, { prefix: "/chat" });
fastify.register(transactionsRoutes, { prefix: "/transactions" });
fastify.register(authRoutes, { prefix: "/auth" });

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
