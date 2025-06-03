import type { FastifyInstance } from "fastify";
import { createAgent, getAgent } from "../utils/agent";
import DB from "@autofun/database";


interface CreateAIAgentRequest {
	avatar?: string | null;
	config: string;
	frameworkVersion?: string | null;
	managedModelName?: string | null;
	name: string;
	projectId: string;
	publicChat?: boolean | null;
	referral?: string | null;
	referralTokenId?: string | null;
	tee?: boolean | null;
}

export default async function agentRoutes(fastify: FastifyInstance) {
	// Create AI Agent
	fastify.post<{ Body: CreateAIAgentRequest }>("/create-agent", async (request, reply) => {
		try {
			const agent = await createAgent(request.body);
			return { success: true, data: agent };
		} catch (error) {
			return reply.status(500).send({ error: error?.message || "Failed to create AI agent" });
		}
	});

	// Get AI Agent by ID, and store it in DB
	fastify.post<{ Params: { agentId: string }; Body: { contractAddress: string } }>(
    "/connect-agent/:agentId",
    async (request, reply) => {
      const { agentId } = request.params;
      const { contractAddress } = request.body;
      
      try {
        const agentData = await getAgent(agentId);
        if (!agentData) throw new Error("No agent data returned from Fleek");
  
        const agentDoc = {
          name: agentData.name || "Unnamed Agent",
          bio: agentData.bio || "No bio",
          createdBy: agentData.createdBy || "unknown",
          image: agentData.imageUrl || "",
          relatedTokenAddress: contractAddress,
        };
  
        const token = await DB.Token.findOne({ contractAddress });
        if (!token) throw new Error("Token not found");
  
        token.agent = agentDoc;
        await token.save();
        return { success: true, data: token };
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({ error: error.message || "Failed to connect AI agent" });
      }
    }
  );  
}
