import Fastify from "fastify";
import redis from "@autofun/redis";
import logger from '@autofun/logger';

const fastify = Fastify({
  logger
});

fastify.get("/", function (request, reply) {
  reply.send({ hello: "world" });
});

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
