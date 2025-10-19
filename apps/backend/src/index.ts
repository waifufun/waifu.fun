import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
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

const fastify = Fastify({
	logger: {
		stream: {
			write: (msg: string) => {
				try {
					const logData = JSON.parse(msg);

					if (logData.res) {
						const method = logData.res?.method || "unknown";
						const url = logData.res?.url || "unknown";
						const statusCode = logData?.res.statusCode;
						const responseTime = logData.responseTime?.toFixed(2);
						const fullMessage = `${method} | ${url} - ${responseTime}ms -> ${statusCode}`;
						if (statusCode >= 400) {
							logger.warn(fullMessage);
						} else {
							logger.info(fullMessage);
						}
					}

					if (!logData.req && !logData.res) {
						logger.info(logData.msg || logData);
					}
				} catch (error) {
					logger.error(`Error parsing Fastify log: ${error}, original message: ${msg}`);
					logger.info(msg);
				}
			},
		},
		level: "info",
		serializers: {
			req: (request) => ({
				method: request.method,
				url: request.url,
				body: request.body,
				headers: request.headers,
				host: request.host,
				remoteAddress: request.ip,
				remotePort: request.socket.remotePort,
			}),
			res: (reply) => ({
				method: reply.request?.method,
				url: reply.request?.url,
				headers: reply.headers,
				host: reply?.request?.host,
				remoteAddress: reply?.request?.ip,
				statusCode: reply.statusCode,
			}),
		},
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
	origin: configuredCors?.length > 0 ? configuredCors : ["http://localhost:3000", "http://localhost:3330"],
	credentials: true,
});

fastify.register(fastifyJWT, {
	secret: process.env.JWT_SECRET,
});

fastify.register(fastifySwagger, {
	openapi: {
		openapi: "3.0.3",
		info: {
			title: "Launchpad API",
			description: "API for token launchpad with trading, authentication, and agent management",
			version: "1.0.0",
		},
		servers: [
			{
				url: process.env.API_URL || "http://localhost:3331",
				description: "API server",
			},
		],
		tags: [
			{ name: "tokens", description: "Token management endpoints" },
			{ name: "prices", description: "Price tracking endpoints" },
			{ name: "auth", description: "Authentication endpoints" },
			{ name: "chat", description: "Chat endpoints" },
			{ name: "generation", description: "AI generation endpoints" },
			{ name: "transactions", description: "Transaction endpoints" },
			{ name: "agents", description: "Agent management endpoints" },
			{ name: "user", description: "User management endpoints" },
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description: "JWT authentication",
				},
			},
		},
	},
});

fastify.register(fastifySwaggerUI, {
	routePrefix: "/docs",
	uiConfig: {
		docExpansion: "list",
		deepLinking: true,
	},
	staticCSP: true,
	transformStaticCSP: (header) => header,
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

const port = 3331;

const start = async () => {
	try {
		await fastify.listen({ port, host: "0.0.0.0" });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};
start();
