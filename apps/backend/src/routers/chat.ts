import type { FastifyInstance } from "fastify";

export default async function chatRoutes(fastify: FastifyInstance) {
  /** Retrieve crypto token prices */
  fastify.post("/history", async (request) => {
    return { status: "OK" };
  });

  fastify.post("/message", async (request) => {
    return { status: "OK" };
  });
}
