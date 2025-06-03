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

				const existingAgent = await DB.Agent.findOne({ tokenAddress: contractAddress });
				if (existingAgent) {
					return reply.status(409).send({ error: "Agent already exists for this contract address" });
				}

				const agentDoc = await DB.Agent.create({
					name: agentData.name,
					bio: agentData.bio,
					createdBy: agentData.createdBy,
					image: agentData.image,
					tokenAddress: contractAddress,
				});

				return { success: true, data: agentDoc };
			} catch (error: any) {
				request.log.error(error);
				return reply.status(500).send({ error: error.message || "Failed to connect AI agent" });
			}
		},
	);
}
