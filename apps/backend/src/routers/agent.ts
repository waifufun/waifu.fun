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
	fastify.post<{ Body: CreateAIAgentRequest }>("/create-agent", async (request) => {
		try {
			const agent = await createAgent(request.body);
			return { success: true, data: agent };
		} catch (error) {
			throw new Error(`Failed To Create Agent: ${(error as Error).message}`);
		}
	});

	// Get AI Agent by ID, and store it in DB
	fastify.post<{ Params: { agentId: string }; Body: { contractAddress: string } }>(
		"/connect-agent/:agentId",
		async (request) => {
			const { agentId } = request.params;
			const { contractAddress } = request.body;

			try {
				const agentData = await getAgent(agentId);
				if (!agentData) throw new Error("No agent data returned from Fleek");
				console.log("agent data", agentData);
				const existingAgent = await DB.Agent.findOne({ tokenAddress: contractAddress });
				if (existingAgent) {
					throw new Error("Agent already exists for this contract address");
				}

				const agentDoc = await DB.Agent.create({
					name: agentData.name,
					bio: agentData.bio || "",
					createdBy: agentData.createdBy || "Unknown",
					avatar: agentData.avatar || "",
					contractAddress: contractAddress || "",
				});

				return { success: true, data: agentDoc };
			} catch (error) {
				throw new Error(`Failed To Connect Agent: ${(error as Error).message}`);
			}
		},
	);

	// get agent based on contractAddress
	fastify.post<{
		Body: {
			contractAddress: string;
		};
	}>("/get-agent", async (request, reply) => {
		const { contractAddress } = request.body;

		try {
			const result = await DB.Agent.findOne({ contractAddress });
			return reply.send(result);
		} catch (error) {
			throw new Error(`Failed To Fetch Agent: ${(error as Error).message}`);
		}
	});
}
