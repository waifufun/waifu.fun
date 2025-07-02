import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import tokenRoutes from "./routers/tokens";
import pricesRoutes from "./routers/prices";
import chatRoutes from "./routers/chat";
import generationRoutes from "./routers/generation";
import logger from "@autofun/logger";
import transactionsRoutes from "./routers/transaction";
import authRoutes from "./routers/auth";
import fastifyJWT from "@fastify/jwt";
import { registerProtectedRoutes, registerPublicRoutes } from "./middlewares/protected-routes";
import agentRoutes from "./routers/agent";
import userRoutes from "./routers/user";
import adminRoutes from "./routers/admin";
import ownerRoutes from "./routers/owner";

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
	bodyLimit: 7 * 1024 * 1024, // 7MB global body limit
});

if (!process.env.JWT_SECRET) {
	throw new Error("JWT_SECRET is not set in process.env");
}

fastify.register(helmet);
fastify.register(fastifyCookie);

const configuredCors = process?.env?.CORS_DOMAINS ? String(process.env.CORS_DOMAINS).split(",") : [];

fastify.register(cors, {
	allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	origin: configuredCors?.length > 0 ? configuredCors : ["http://localhost:3000"],
	credentials: true,
});

fastify.register(fastifyJWT, {
	secret: process.env.JWT_SECRET,
});

fastify.get("/", (_, reply) => {
	reply.send({ hello: "world" });
});

registerPublicRoutes(fastify);
registerProtectedRoutes(fastify);

fastify.register(tokenRoutes, { prefix: "/tokens" });
fastify.register(pricesRoutes, { prefix: "/prices" });
fastify.register(chatRoutes, { prefix: "/chat" });
fastify.register(transactionsRoutes, { prefix: "/transactions" });
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(generationRoutes, { prefix: "/generation" });
fastify.register(agentRoutes, { prefix: "/agent" });
fastify.register(userRoutes, { prefix: "/user" });
fastify.register(adminRoutes, { prefix: "/admin" });
fastify.register(ownerRoutes, { prefix: "/owner" });

const port = 3001;

const start = async () => {
	try {
		await fastify.listen({ port, host: "0.0.0.0" });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};
start();
