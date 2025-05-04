import { type FastifyInstance, type FastifyPluginOptions } from "fastify";
import redis from "@autofun/redis";
import DB from "@autofun/database";

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
    const tokens = await DB.Token.find().limit(10).lean();
    return { tokens };
  });

  /** Retrieve a single token */
  fastify.get<{
    Params: {
      contractAddress: string;
    };
    Reply: IToken | null;
  }>("/:contractAddress", async (request) => {
    const { contractAddress } = request.params;

    const token = await DB.Token.findOne({
      contractAddress,
    }).lean();

    return token;
  });
}
