import type { FastifyInstance } from "fastify";
import { FLEEK_API_URL } from "@autofun/constants";

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
			const response = await fetch(`${FLEEK_API_URL}/api/v2/ai-agents`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Api-Key": process.env.FLEEK_API_KEY || "",
				},
				body: JSON.stringify(request.body),
			});

			if (!response.ok) {
				const errorData = await response.json();
				return reply.status(response.status).send({ error: errorData });
			}

			const data = await response.json();
			return {
				success: true,
				data: data,
			};
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ error: "Failed to create AI agent" });
		}
	});
	// Get AI Agent by ID
	fastify.get<{ Params: { agentId: string } }>("/get-agent/:agentId", async (request, reply) => {
		const { agentId } = request.params;

		try {
			// TODO: check this route
			const response = await fetch(`${FLEEK_API_URL}/api/v1/ai-agents/${agentId}/public`, {
				headers: {
					"X-Api-Key": process.env.FLEEK_API_KEY || "",
				},
			});

			if (!response.ok) {
				const errorData = await response.json();
				return reply.status(response.status).send({ error: errorData });
			}

			const data = await response.json();
			return {
				success: true,
				data: data,
			};
		} catch (error) {
			fastify.log.error(error);
			return reply.status(500).send({ error: "Failed to fetch AI agent" });
		}
	});
}
