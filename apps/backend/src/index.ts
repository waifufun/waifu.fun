import Fastify from "fastify";
import redis from "@autofun/redis";
import logger from "@autofun/logger";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import tokenRoutes from "./routers/tokens";

const fastify = Fastify({
  loggerInstance: logger,
});

fastify.register(helmet);

fastify.register(cors, {
  allowedHeaders: ["*"],
  origin: "*",
});

fastify.get("/", function (request, reply) {
  reply.send({ hello: "world" });
});

fastify.register(tokenRoutes, { prefix: '/tokens' });

const port = 3001;

const start = async () => {
  try {
    await fastify.listen({ port });

    const a = await redis.get("a");
    fastify.log.info(`Server listening on port: ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
