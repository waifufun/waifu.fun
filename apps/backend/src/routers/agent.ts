import type { FastifyInstance } from "fastify";
import { createAgent, getAgent } from "../utils/agent";
import DB from "@autofun/database";
import type { TChain, TChainId } from "@autofun/types";

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
	fastify.post<{ Params: { chain: TChain; chainId: TChainId; agentId: string }; Body: { contractAddress: string } }>(
		"/connect-agent/:chain/:chainId/:agentId",
		async (request) => {
			const { agentId, chain, chainId } = request.params;
			const { contractAddress } = request.body;

			try {
				const agentData = await getAgent(agentId);
				if (!agentData) throw new Error("No agent data returned from Fleek");
				const existingAgent = await DB.Agent.findOne({ contractAddress: contractAddress });
				if (existingAgent) {
					throw new Error("Agent already exists for this contract address");
				}

				const agentDoc = await DB.Agent.create({
					name: agentData.name,
					bio: agentData.bio || "",
					createdBy: agentData.createdBy || "Unknown",
					avatar: agentData.avatar || "",
					contractAddress: contractAddress || "",
					chain: chain,
					chainId: chainId,
				});

				return { success: true, data: agentDoc };
			} catch (error) {
				throw new Error(`Failed To Connect Agent: ${(error as Error).message}`);
			}
		},
	);

	fastify.post("/get-agents", async (request, reply) => {
		const body = request.body as {
			contractAddress: string;
			chain: TChain;
			chainId: TChainId;
			page?: number;
			limit?: number;
		};

		const { contractAddress, chain, chainId, page = 1, limit } = body;

		const paginationOptions = {
			page,
			lean: true,
			limit: limit ? (limit > 50 ? 50 : limit) : 50,
			leanWithId: false,
			sort: "-createdAt",
		};

		const query = { contractAddress, chain, chainId };

		try {
			const result = await DB.Agent.paginate(query, paginationOptions);
			return reply.send(result);
		} catch (error) {
			throw new Error(`Failed To Fetch Agents: ${(error as Error).message}`);
		}
	});
}
