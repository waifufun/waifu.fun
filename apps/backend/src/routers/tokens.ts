import { type FastifyInstance, type FastifyPluginOptions } from "fastify";
import { type IToken } from '@autofun/types';

export default async function tokenRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  /** Retrieve multiple tokens */
  fastify.get("/", async (request, reply) => {
    return { tokens: [] };
  });

  /** Retrieve a single token */
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    return { token: `Details for token ${id}` };
  });
}
