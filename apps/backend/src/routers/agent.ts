import type { FastifyInstance } from "fastify";
import { createAgent, getAgent } from "../utils/agent";
import DB from "@autofun/database";
import type { TChain, TChainId, SolanaNetworkIds } from "@autofun/types";
import { SolanaRpcProvider } from "@autofun/rpc";
import { authenticationMiddleware } from "../middlewares/authentication";

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
	// Create AI Agent with authentication
	fastify.post<{ Body: CreateAIAgentRequest }>(
		"/create-agent",
		{
			preHandler: authenticationMiddleware,
		},
		async (request) => {
			try {
				const agent = await createAgent(request.body);
				return { success: true, data: agent };
			} catch (error) {
				throw new Error(`Failed To Create Agent: ${(error as Error).message}`);
			}
		},
	);

	// Get AI Agent by ID, and store it in DB with token balance verification
	fastify.post<{ Params: { chain: TChain; chainId: TChainId; agentId: string }; Body: { contractAddress: string } }>(
		"/connect-agent/:chain/:chainId/:agentId",
		{
			preHandler: authenticationMiddleware,
		},
		async (request, reply) => {
			const { agentId, chain, chainId } = request.params;
			const { contractAddress } = request.body;
			const user = request.authUser;

			if (!user?.solana && process.env.NODE_ENV !== "development") {
				return reply.code(401).send({ success: false, error: "Authentication required" });
			}

			try {
				// Verify user holds tokens of this contract (Solana only for now)
				if (chain === "solana" && user?.solana) {
					const rpc = await SolanaRpcProvider.connect(chainId as unknown as SolanaNetworkIds);
					const balance = await rpc.getTokenBalance(contractAddress, user.solana);

					if (balance <= 0) {
						return reply.code(403).send({
							success: false,
							error: "You must hold tokens to create an agent for this contract",
						});
					}
				}

				const agentData = await getAgent(agentId);
				if (!agentData) throw new Error("No agent data returned from Fleek");

				const existingAgent = await DB.Agent.findOne({ contractAddress: contractAddress });
				if (existingAgent) {
					throw new Error("Agent already exists for this contract address");
				}

				const agentDoc = await DB.Agent.create({
					name: agentData.name,
					bio: agentData.bio || "",
					createdBy: user?.solana || agentData.createdBy || "Unknown",
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

		const result = await DB.Agent.paginate(query, paginationOptions);
		return reply.send(result);
	});
}
