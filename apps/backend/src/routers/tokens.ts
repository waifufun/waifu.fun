import { type FastifyInstance, type FastifyPluginOptions } from "fastify";
import redis from "@autofun/redis";

import { type IToken } from "@autofun/types";

export default async function tokenRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  /** Retrieve multiple tokens */
  fastify.get<{
    Params: {};
    QueryParams: {};
    Reply: { tokens: IToken[] };
  }>("/", async (request, reply) => {
    return { tokens: [] };
  });

  /** Retrieve a single token */
  fastify.get<{
    Params: {
      contractAddress: string;
    };
    Reply: IToken | null;
  }>("/:contractAddress", async (request) => {
    const { contractAddress } = request.params;
    return null;
  });
}
